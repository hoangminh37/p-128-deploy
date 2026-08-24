/**
 * Màn đăng nhập.
 *
 * Nằm NGOÀI khung ứng dụng: không thanh bên, không thanh tiêu đề. Chưa đăng
 * nhập thì chưa có hội thoại nào để liệt kê và chưa có hồ sơ nào để mở, bày cái
 * khung rỗng ra chỉ tổ làm người dùng tưởng ứng dụng hỏng.
 *
 * CHIA ĐÔI MÀN HÌNH, và hai nửa thuộc hai họ nền khác nhau:
 *
 *   Nửa trái, nền navy có họa tiết — phần DẪN DẮT. Một tiêu đề Lora lớn và một
 *   câu nói rõ rằng ứng dụng TỰ BIẾT vai trò. Câu đó phải đứng ở đây chứ không
 *   nằm lẫn trong form: người dùng quen với những ứng dụng bắt chọn "tôi là
 *   bệnh nhân / tôi là nhân viên" sẽ đi tìm cái nút đó, và họ phải được trả lời
 *   trước khi kịp đi tìm.
 *
 *   Nửa phải, nền canvas — phần LÀM VIỆC. Đúng hai ô nhập và một nút.
 *
 * Dưới 1024px hai nửa xếp dọc, nửa navy ở trên. Thứ tự đó giữ nguyên nhịp đọc
 * của bản rộng, và nó cũng là thứ tự trong DOM nên người dùng bàn phím đi Tab
 * theo đúng mạch.
 *
 * KHÔNG có chỗ nào cho người dùng chọn vai trò. Vai trò đến từ response đăng
 * nhập, do backend quyết định từ tài khoản (hợp đồng mục 3). Màn chọn vai trò
 * của bản trước đã bị bỏ hẳn vì hỏi "bạn là ai" rồi tin luôn câu trả lời thì
 * bất kỳ ai cũng tự nhận là biên tập viên y khoa được.
 */
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { ApiError, login } from '../lib/api'
import { APP_NAME } from '../lib/appName'
import { loginRequestSchema, type LoginResponse } from '../lib/schemas'
import { DEMO_ACCOUNTS } from '../mocks/demoAccounts'
import { EXPIRED_SESSION_REASON } from '../session/ExpiredSessionWatcher'
import { HOME_PATH, useSession } from '../session/context'
import { Backdrop } from '../ui/Backdrop'
import { ErrorNotice } from '../ui/ErrorNotice'
import { AlertIcon, AppMark } from '../ui/icons'
import { StateBlock } from '../ui/ResponseStates'

/**
 * Schema form dựng từ schema hợp đồng, chỉ thay thông báo lỗi bằng tiếng Việt
 * nói rõ phải sửa gì. Ràng buộc thì giữ nguyên của hợp đồng.
 */
const loginFormSchema = loginRequestSchema.extend({
  email: z.email({
    error: 'Bạn hãy nhập đúng dạng email, ví dụ ten@example.com.',
  }),
  password: z.string().min(1, { error: 'Bạn hãy nhập mật khẩu.' }),
})

type LoginFormValues = z.infer<typeof loginFormSchema>

/** Nhãn của một trường. Tối thiểu 17px theo sàn cỡ chữ. */
const FIELD_LABEL_CLASS = 'font-display block text-input font-semibold text-body'
/** Ô nhập nền trắng trên nền canvas: chỗ nền đổi màu chính là ranh giới của ô,
 * cộng thêm một viền `slate` (4.96:1 trên trắng) cho ngưỡng 3:1 của WCAG
 * 1.4.11. `line` KHÔNG dùng được ở đây — xem cảnh báo trong `index.css`. */
const FIELD_INPUT_CLASS =
  'font-body mt-snug min-h-touch w-full rounded-card border-2 border-slate bg-surface p-snug text-input text-body'

/** Lỗi hiện ngay dưới trường của nó, không gom về cuối form. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (message === undefined) return null
  return (
    <p id={id} role="alert" className="font-display mt-tight text-question text-alert">
      {message}
    </p>
  )
}

/**
 * Khối tài khoản mẫu, CHỈ hiện khi chạy dev.
 *
 * Gate 2 chưa có backend thật, nên người xem demo mở trang lên sẽ đứng trước
 * một ô đăng nhập mà không có tài khoản nào để gõ vào. Khối này nói thẳng đây
 * là bản demo và đưa sẵn hai tài khoản, bấm một cái là điền vào form.
 *
 * `import.meta.env.DEV` được Vite thay bằng hằng lúc build, nên cả khối này biến
 * mất khỏi bản phát hành — không phải chuyện tin vào một cờ lúc chạy.
 */
function DemoAccountsPanel({
  onPick,
}: {
  onPick: (account: { email: string; password: string }) => void
}) {
  return (
    <div className="mt-block rounded-card bg-sand p-cozy">
      <p className="font-display text-input font-semibold text-sand-deep">
        Tài khoản mẫu (Development)
      </p>
      <p className="font-display mt-hair text-question text-sand-deep">
        Bấm một tài khoản bên dưới để tự động điền thông tin đăng nhập vào hệ thống:
      </p>

      <ul className="mt-snug space-y-tight">
        {DEMO_ACCOUNTS.map((account) => (
          <li key={account.email}>
            <button
              type="button"
              onClick={() => onPick(account)}
              className="motion-lift font-display flex min-h-touch w-full flex-col justify-center rounded-card bg-surface px-snug py-tight text-left text-body"
            >
              <span className="text-input font-semibold">{account.label}</span>
              <span className="font-mono text-question">
                {account.email} · {account.password}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function LoginScreen() {
  const { signIn } = useSession()
  const navigate = useNavigate()
  const location = useLocation()

  /**
   * Người dùng tới đây vì phiên hết hạn, chứ không phải tự bấm đăng nhập.
   *
   * `ExpiredSessionWatcher` gắn lý do vào `location.state` khi lớp api gặp 401.
   * Đọc từ đó chứ không giữ thêm một state toàn cục: thông tin này chỉ đúng cho
   * đúng một lần điều hướng, và bấm tải lại trang thì nó biến mất — đúng như
   * mong đợi, vì lúc đó câu thông báo không còn liên quan gì nữa.
   */
  const isSessionExpired =
    (location.state as { reason?: unknown } | null)?.reason === EXPIRED_SESSION_REASON

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  })

  const mutation = useMutation({
    mutationFn: (values: LoginFormValues) => login(values),
    onSuccess: (response: LoginResponse) => {
      signIn(response)
      // Về đường dẫn gốc, không tự đoán đích. Biên tập viên đi tiếp sang
      // `/editor`; bệnh nhân thì còn tuỳ đã khai hồ sơ hay chưa, mà lúc này
      // query đọc hồ sơ còn chưa chạy xong. `LandingRedirect` mới đủ dữ kiện.
      void navigate(HOME_PATH, { replace: true })
    },
  })

  const onSubmit = handleSubmit((values) => mutation.mutate(values))

  /**
   * 401 là "sai email hoặc mật khẩu", không phải sự cố kỹ thuật, nên không dùng
   * `ErrorNotice`. Một câu duy nhất cho cả hai trường hợp: phân biệt "email này
   * không tồn tại" với "mật khẩu sai" cho phép người ngoài dò xem một địa chỉ có
   * tài khoản trong hệ thống hay không — mà đây là hệ thống y tế, riêng việc
   * "người này có bệnh mãn tính" đã là thông tin không được để lộ.
   */
  const isBadCredentials =
    mutation.error instanceof ApiError && mutation.error.status === 401

  return (
    <div className="flex min-h-dvh flex-col bg-ink lg:flex-row">
      {/* ---- Nửa trái: nền navy, phần dẫn dắt ---- */}
      <section className="relative isolate flex flex-col justify-center overflow-hidden px-cozy py-block lg:w-1/2 lg:px-block">
        <Backdrop />

        <div className="relative z-10 mx-auto w-full max-w-answer">
          <Link
            to="/"
            className="flex w-fit items-center gap-tight no-underline"
          >
            <AppMark className="h-8 w-8 shrink-0 text-mint" />
            <span className="font-display text-app font-bold text-white">
              {APP_NAME}
            </span>
          </Link>

          <h1 className="mt-block text-hero font-semibold text-white">
            Chào bạn quay lại.
          </h1>
          <p className="mt-cozy text-answer text-mist">
            Học tập và làm chủ sức khỏe mỗi ngày cùng trợ lý giáo dục cá nhân hóa.
            Hệ thống tự động điều chỉnh lộ trình học theo vai trò của bạn.
          </p>
        </div>
      </section>

      {/* ---- Nửa phải: nền canvas, form ---- */}
      <main className="relative isolate flex flex-1 flex-col justify-center overflow-hidden bg-canvas px-cozy py-block text-body lg:w-1/2 lg:px-block">
        <Backdrop tone="canvas" />

        <div className="relative z-10 mx-auto w-full max-w-answer">
          <h2 className="text-ask font-semibold text-body">Đăng nhập</h2>

          {/* Phiên hết hạn không phải lỗi của người dùng và cũng không phải sự cố
              kỹ thuật, nên chỉ một dòng `role="status"` chứ không dùng khối cảnh
              báo — dành khối đó cho việc gõ sai mật khẩu ngay bên dưới. */}
          {isSessionExpired && (
            <p role="status" className="font-display mt-block text-notice text-slate">
              Phiên đăng nhập của bạn đã hết hạn. Bạn hãy đăng nhập lại để tiếp tục.
            </p>
          )}

          {isBadCredentials && (
            <div className="mt-block">
              <StateBlock
                tone="fault"
                role="alert"
                heading="Email hoặc mật khẩu không đúng"
                icon={<AlertIcon className="h-7 w-7" />}
              >
                <p className="font-display text-notice text-body">
                  Bạn hãy kiểm tra lại rồi thử lần nữa. Vì lý do an toàn, hệ thống
                  không cho biết địa chỉ email này đã có tài khoản hay chưa.
                </p>
              </StateBlock>
            </div>
          )}

          {mutation.isError && !isBadCredentials && (
            <div className="mt-block">
              <ErrorNotice
                error={mutation.error}
                retryLabel="Đăng nhập lại"
                onRetry={() => void onSubmit()}
              />
            </div>
          )}

          <form onSubmit={onSubmit} noValidate className="mt-block">
            <div>
              <label htmlFor="email" className={FIELD_LABEL_CLASS}>
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                aria-invalid={errors.email !== undefined}
                aria-describedby={errors.email ? 'email-error' : undefined}
                {...register('email')}
                className={FIELD_INPUT_CLASS}
              />
              <FieldError id="email-error" message={errors.email?.message} />
            </div>

            <div className="mt-block">
              <label htmlFor="password" className={FIELD_LABEL_CLASS}>
                Mật khẩu
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={errors.password !== undefined}
                aria-describedby={errors.password ? 'password-error' : undefined}
                {...register('password')}
                className={FIELD_INPUT_CLASS}
              />
              <FieldError id="password-error" message={errors.password?.message} />
            </div>

            <button
              type="submit"
              disabled={mutation.isPending}
              className="motion-press font-display mt-block min-h-call w-full rounded-pill bg-mint px-cozy text-input font-bold text-ink enabled:hover:bg-mint-press disabled:bg-surface disabled:font-normal disabled:text-slate"
            >
              {mutation.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </button>

            {mutation.isPending && (
              <p role="status" className="font-display mt-tight text-question text-slate">
                Đang kiểm tra tài khoản…
              </p>
            )}
          </form>

          {import.meta.env.DEV && (
            <DemoAccountsPanel
              onPick={(account) => {
                setValue('email', account.email, { shouldValidate: true })
                setValue('password', account.password, { shouldValidate: true })
              }}
            />
          )}
        </div>
      </main>
    </div>
  )
}
