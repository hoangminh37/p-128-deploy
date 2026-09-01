/**
 * Màn đăng nhập — CHÉP TỪ SECTION `id="dn"` CỦA BẢN MẪU.
 *
 * `.dn-doi` chia đôi màn. `.dn-trai` là nửa dẫn dắt: bông sen nét mảnh mờ 13%
 * neo ở góc dưới bên phải, nhãn `.eb solo`, một câu dẫn, và BẢNG BA VĂN BẢN
 * NGUỒN — ba hàng kẻ ngang, số hiệu mono màu tím ở cột trái. `.dn-phai` là
 * form. Dưới 1024px `.dn-trai` biến mất hẳn bằng CSS của bản mẫu, không rẽ
 * nhánh ở đây.
 *
 * Ba số hiệu ở nửa trái là dữ liệu THẬT của hệ thống, không phải chữ trang trí:
 * chúng là ba văn bản nguồn mà toàn bộ câu trả lời dựa vào. Khai thành một hằng
 * có tên để lúc kho tài liệu đổi thì sửa đúng một chỗ.
 *
 * GIỮ LẠI TỪ BẢN TRƯỚC, vì bản mẫu là trang tĩnh nên không có: xác thực bằng
 * `react-hook-form` + zod, phân biệt 401 với sự cố kỹ thuật, câu thông báo
 * phiên hết hạn. Bản mẫu bày ba tài khoản mẫu bằng lớp `.tkm`; khối đó ở đây
 * dùng đúng lớp ấy nhưng chỉ dựng khi chạy dev.
 */
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { ApiError, login } from '../lib/api'
import { APP_NAME } from '../lib/appName'
import { loginRequestSchema, type LoginResponse } from '../lib/schemas'
import { VAN_BAN_NGUON } from '../lib/vanBanNguon'
import { DEMO_ACCOUNTS } from '../mocks/demoAccounts'
import { EXPIRED_SESSION_REASON } from '../session/ExpiredSessionWatcher'
import { HOME_PATH, useSession } from '../session/context'
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

/** Lỗi hiện ngay dưới trường của nó, không gom về cuối form. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (message === undefined) return null
  return (
    <p id={id} role="alert" className="lab" style={{ color: 'var(--do)', marginTop: 7 }}>
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
    <div style={{ marginTop: 26, paddingTop: 16, borderTop: '1px solid var(--ke)' }}>
      <span className="lab">Tài khoản mẫu</span>

      <ul
        style={{ listStyle: 'none', margin: '9px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 7 }}
      >
        {DEMO_ACCOUNTS.map((account) => (
          <li key={account.email}>
            {/* `.tkm` của bản mẫu: khối kẻ khung, tên vai ở dòng trên, cặp
                email · mật khẩu ở dòng dưới bằng mono. Viền chuyển tím khi rê
                chuột — `.tkm:hover{border-color:var(--tim)}`. */}
            <button type="button" onClick={() => onPick(account)} className="tkm">
              <span>{account.label}</span>
              <span className="mono">
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
    <div className="dn-doi">
      {/* ---- Nửa trái: dẫn dắt. Ẩn hẳn dưới 1024px bằng CSS bản mẫu ---- */}
      <div className="dn-trai">
        {/* `.dn-sen` — bông sen nét mảnh, `opacity:.13`, neo góc dưới bên phải
            và cố ý tràn ra ngoài khung. Chép nguyên bốn path của bản mẫu. */}
        <svg className="dn-sen" viewBox="0 0 100 100" aria-hidden="true">
          <g fill="none" stroke="var(--tim)" strokeWidth="1.5" strokeLinecap="round">
            <path d="M50 20c11 9 17 20 17 30.5C67 63 59 71.5 50 71.5S33 63 33 50.5C33 40 39 29 50 20Z" />
            <path d="M28 36c-8 10-9.5 23-3.5 31.5C30 76 40 79 50 78M72 36c8 10 9.5 23 3.5 31.5C70 76 60 79 50 78" />
            <path d="M13 52c-3 11 1 22 9.5 27.5M87 52c3 11-1 22-9.5 27.5" />
            <path d="M50 78v9" />
          </g>
        </svg>

        <div className="eb solo">Bộ Y tế · Ba văn bản nguồn</div>
        <h2 style={{ marginTop: 18 }}>Chào bạn quay lại.</h2>
        <p
          style={{
            marginTop: 18,
            maxWidth: '38ch',
            color: 'var(--xam)',
            fontSize: 'var(--t-note)',
            lineHeight: 1.75,
            position: 'relative',
          }}
        >
          Trợ lý giải thích về đái tháo đường típ 2 và tăng huyết áp, và luôn dẫn về văn
          bản gốc để bạn mở ra đọc.
        </p>

        {/* Ba hàng kẻ ngang, số hiệu mono TÍM ở cột trái. Hàng cuối thêm nét
            dưới để bảng đóng lại — đúng như bản mẫu. */}
        <div style={{ marginTop: 34, maxWidth: '34ch', position: 'relative' }}>
          {VAN_BAN_NGUON.map((item, index) => (
            <div
              key={item.code}
              style={{
                display: 'flex',
                gap: 14,
                alignItems: 'baseline',
                padding: '11px 0',
                borderTop: '1px solid var(--ke)',
                borderBottom:
                  index === VAN_BAN_NGUON.length - 1 ? '1px solid var(--ke)' : undefined,
              }}
            >
              <span
                className="mono"
                style={{ color: 'var(--tim)', fontSize: 'var(--t-mono-s)', flex: 'none' }}
              >
                {item.code}
              </span>
              <span style={{ fontSize: 'var(--t-note)', color: 'var(--xam)' }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Nửa phải: form ---- */}
      <main className="dn-phai">
        <div style={{ width: '100%', maxWidth: 400 }}>
          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              textDecoration: 'none',
              width: 'fit-content',
            }}
          >
            <AppMark className="dn-mark" />
            <span style={{ fontFamily: 'var(--f-display)', fontSize: 20 }}>{APP_NAME}</span>
          </Link>

          <h1 style={{ fontSize: 'var(--t-h2)', lineHeight: 1.2, marginTop: 26 }}>
            Đăng nhập
          </h1>
          <p
            style={{
              fontSize: 'var(--t-note)',
              color: 'var(--xam)',
              marginTop: 8,
              lineHeight: 1.65,
              maxWidth: '40ch',
            }}
          >
            Hệ thống tự đưa bạn vào đúng khu vực theo vai trò của tài khoản.
          </p>

          {/* Phiên hết hạn không phải lỗi của người dùng và cũng không phải sự cố
              kỹ thuật, nên chỉ một dòng `role="status"` chứ không dùng khối cảnh
              báo — dành khối đó cho việc gõ sai mật khẩu ngay bên dưới. */}
          {isSessionExpired && (
            <p role="status" className="lab" style={{ marginTop: 20, lineHeight: 1.6 }}>
              Phiên đăng nhập của bạn đã hết hạn. Bạn hãy đăng nhập lại để tiếp tục.
            </p>
          )}

          {isBadCredentials && (
            <div style={{ marginTop: 20 }}>
              <StateBlock
                tone="fault"
                role="alert"
                heading="Email hoặc mật khẩu không đúng"
                icon={<AlertIcon className="" />}
              >
                <p>
                  Bạn hãy kiểm tra lại rồi thử lần nữa. Vì lý do an toàn, hệ thống không
                  cho biết địa chỉ email này đã có tài khoản hay chưa.
                </p>
              </StateBlock>
            </div>
          )}

          {mutation.isError && !isBadCredentials && (
            <div style={{ marginTop: 20 }}>
              <ErrorNotice
                error={mutation.error}
                retryLabel="Đăng nhập lại"
                onRetry={() => void onSubmit()}
              />
            </div>
          )}

          <form onSubmit={onSubmit} noValidate>
            <div style={{ marginTop: 26 }}>
              <label htmlFor="email" className="lab">
                Email
              </label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                placeholder="ten@example.com"
                aria-invalid={errors.email !== undefined}
                aria-describedby={errors.email ? 'email-error' : undefined}
                {...register('email')}
                className="o"
                style={{ marginTop: 7 }}
              />
              <FieldError id="email-error" message={errors.email?.message} />
            </div>

            <div style={{ marginTop: 16 }}>
              <label htmlFor="password" className="lab">
                Mật khẩu
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Nhập mật khẩu"
                aria-invalid={errors.password !== undefined}
                aria-describedby={errors.password ? 'password-error' : undefined}
                {...register('password')}
                className="o"
                style={{ marginTop: 7 }}
              />
              <FieldError id="password-error" message={errors.password?.message} />
            </div>

            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn pri"
              style={{ width: '100%', marginTop: 24 }}
            >
              {mutation.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </button>

            {mutation.isPending && (
              <p role="status" className="lab" style={{ marginTop: 9 }}>
                Đang kiểm tra tài khoản…
              </p>
            )}
          </form>

          <DemoAccountsPanel
            onPick={(account) => {
              setValue('email', account.email, { shouldValidate: true })
              setValue('password', account.password, { shouldValidate: true })
            }}
          />
        </div>
      </main>
    </div>
  )
}
