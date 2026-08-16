/**
 * Màn khai hồ sơ — cũng là màn đầu tiên người dùng mới nhìn thấy.
 *
 * Không còn màn chọn vai trò đứng trước. Vai trò phải đến từ tài khoản, không
 * phải từ việc người dùng tự khai, nên bước đó đã bỏ hẳn (xem `app/guards.tsx`).
 *
 * BỐ CỤC:
 *
 *   1. Ba điều cần nói  — giới hạn của công cụ, đọc trước khi khai bất cứ gì.
 *   2. Form ba bước      — tuổi và thể trạng, rồi bệnh đã được chẩn đoán, rồi
 *                        thời điểm chẩn đoán. Xem `STEP_TITLES`.
 *
 * VÌ SAO CHIA BA BƯỚC: bốn trường hỏi dồn một lúc là một trang dài đặc chữ, và
 * người 45–70 tuổi đang lo lắng nhìn thấy nó thì bỏ giữa chừng. Chia ra thì mỗi
 * màn chỉ còn một câu hỏi, trả lời xong mới thấy câu sau.
 *
 * Dữ liệu KHÔNG mất khi đi lui đi tới: React Hook Form mặc định `shouldUnregister`
 * là false nên giá trị của bước đã rời khỏi màn hình vẫn nằm trong form state.
 *
 * Chọn bệnh dùng thẻ lớn chứ không dùng danh sách thả xuống: thả xuống trên
 * điện thoại là một hộp cuộn nhỏ, ngón tay run bấm rất dễ trượt, và người dùng
 * không nhìn thấy hết lựa chọn cùng lúc.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useForm, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { upsertPatientProfile } from '../lib/api'
import {
  patientProfileSchema,
  primaryConditionSchema,
  type PatientProfileResponse,
  type PrimaryCondition,
} from '../lib/schemas'
import { patientProfileQueryKey, usePatient } from '../patient/context'
import { ErrorNotice } from '../ui/ErrorNotice'
import { ProfileIntro } from '../ui/ProfileIntro'
import { StepProgress } from '../ui/StepProgress'

// ---------------------------------------------------------------------------
// Nhãn tiếng Việt
// ---------------------------------------------------------------------------

/**
 * Tên bệnh kèm tên dân gian trong ngoặc.
 *
 * "Đái tháo đường" là tên trong văn bản Bộ Y tế, nhưng phần lớn người bệnh gọi
 * là "tiểu đường". Ghi cả hai để không ai phải đoán mình thuộc nhóm nào.
 */
const CONDITION_LABEL: Record<PrimaryCondition, string> = {
  type2_diabetes: 'Đái tháo đường típ 2 (tiểu đường)',
  hypertension: 'Tăng huyết áp (cao huyết áp)',
}

/** Lấy thẳng từ schema hợp đồng, không gõ lại danh sách giá trị. */
const CONDITIONS = primaryConditionSchema.options

/**
 * Nhãn của cả ba bước, MỘT bản duy nhất, xưng hô thẳng với người dùng.
 *
 * Trước đây có hai bản `self` và `caregiver` vì form hỏi người dùng đang hỏi
 * cho mình hay hỏi giúp người nhà. Lựa chọn "hỏi giúp người nhà" đã bỏ khỏi
 * giao diện (xem `MUTATION_ASKING_AS`), nên bản `caregiver` không còn đường nào
 * tới được và đã xoá hẳn — giữ lại chỉ tạo ảo giác rằng giao diện vẫn phục vụ
 * hai nhóm người dùng, rồi người sau sẽ mất công cập nhật cả câu chữ đã chết.
 */
const LABELS = {
  age: 'Bạn bao nhiêu tuổi?',
  ageHint: 'Tuổi giúp trợ lý đưa lời khuyên hợp với lứa tuổi của bạn.',
  body: 'Chiều cao và cân nặng',
  bodyHint:
    'Không bắt buộc, bạn có thể bỏ trống cả hai ô này. Trợ lý dùng hai số đó ' +
    'để chọn tài liệu phù hợp với thể trạng của bạn.',
  height: 'Bạn cao bao nhiêu? (tính bằng cm)',
  weight: 'Bạn nặng bao nhiêu? (tính bằng kg)',
  conditions: 'Bác sĩ đã chẩn đoán bạn mắc bệnh nào?',
  conditionsHint:
    'Bạn chọn một bệnh. Nếu bác sĩ chẩn đoán bạn mắc cả hai thì bạn chọn cả hai ô.',
  diagnosed: 'Bạn được chẩn đoán từ khi nào?',
  diagnosedHint:
    'Không bắt buộc. Biết bạn mắc bệnh bao lâu rồi giúp lời khuyên sát hơn. ' +
    'Không nhớ chính xác thì bạn cứ bỏ trống.',
} as const

// ---------------------------------------------------------------------------
// Bệnh: một danh sách ở giao diện, hai trường ở hợp đồng
// ---------------------------------------------------------------------------

/**
 * Giá trị `asking_as` mà màn này luôn gửi lên.
 *
 * Trường `asking_as` VẪN thuộc hợp đồng mục 4 và vẫn nằm nguyên trong
 * `patientProfileSchema`; chỉ có GIAO DIỆN là chưa cho chọn, vì lựa chọn "tôi
 * hỏi giúp người nhà" đã bỏ khỏi form. Mọi hồ sơ khai từ màn này vì thế đều là
 * hồ sơ của chính người đang dùng, tức `self`.
 *
 * Đừng gỡ trường này khỏi payload để "cho gọn": backend có quyền phân biệt hai
 * giá trị, và ngày nào giao diện mở lại lựa chọn kia thì chỉ việc thay hằng số
 * này bằng một trường của form, hợp đồng không phải đổi gì.
 */
const MUTATION_ASKING_AS = 'self' as const

/**
 * Tách danh sách bệnh người dùng chọn thành cặp `primary_condition` +
 * `comorbidities` của hợp đồng.
 *
 * Giao diện hỏi một câu duy nhất "bác sĩ chẩn đoán bạn mắc bệnh nào", chọn được
 * một hoặc cả hai — người mắc đồng thời đái tháo đường và tăng huyết áp không
 * nghĩ theo kiểu bệnh nào là chính, và bắt họ tự xếp hạng là bắt họ trả lời một
 * câu hỏi của lược đồ dữ liệu chứ không phải của y khoa. Nhưng hợp đồng mục 4
 * vẫn tách hai trường, nên chỗ nào đó phải quyết định. Chỗ đó là đây.
 *
 * QUY TẮC, theo đúng thứ tự:
 *
 *   1. Hồ sơ cũ đã có `primary_condition` và bệnh đó VẪN đang được chọn thì giữ
 *      nguyên nó làm bệnh chính. Người dùng vào sửa mỗi cân nặng mà hồ sơ âm
 *      thầm đổi bệnh chính là một thay đổi dữ liệu không ai yêu cầu.
 *   2. Còn lại thì lấy bệnh đứng trước trong `primaryConditionSchema.options`,
 *      tức đái tháo đường típ 2 trước tăng huyết áp. Đây là một thứ tự CỐ ĐỊNH
 *      chứ không phải xếp hạng y khoa: nếu lấy theo thứ tự người dùng bấm thì
 *      cùng một cặp bệnh lại ra hai payload khác nhau tuỳ ai bấm ô nào trước.
 *
 * Bệnh còn lại rơi vào `comorbidities`. Hai trường vì thế không bao giờ trùng
 * nhau — đúng ràng buộc mà form cũ phải tự canh bằng `.refine()`.
 */
function splitConditions(
  selected: readonly PrimaryCondition[],
  previousPrimary: PrimaryCondition | null,
): { primary: PrimaryCondition; comorbidities: PrimaryCondition[] } {
  const ordered = CONDITIONS.filter((condition) => selected.includes(condition))

  const primary =
    previousPrimary !== null && ordered.includes(previousPrimary)
      ? previousPrimary
      : ordered[0]

  return {
    primary,
    comorbidities: ordered.filter((condition) => condition !== primary),
  }
}

// ---------------------------------------------------------------------------
// Schema của form
// ---------------------------------------------------------------------------

const MIN_AGE = 18
const MAX_AGE = 120

const MIN_HEIGHT_CM = 100
const MAX_HEIGHT_CM = 250
const MIN_WEIGHT_KG = 25
const MAX_WEIGHT_KG = 300

/**
 * Schema form dựng từ schema hợp đồng, bỏ `patient_id` (do ứng dụng tự sinh)
 * và thay thông báo lỗi bằng tiếng Việt nói rõ phải sửa gì.
 *
 * Mọi trường đều được `.extend()` đè lại bằng bản KHÔNG có `.default()`, nên
 * kiểu vào và kiểu ra của schema trùng nhau — React Hook Form cần điều đó để
 * `useForm<ProfileFormValues>` khớp với resolver.
 *
 * BA TRƯỜNG CỦA HỢP ĐỒNG KHÔNG CÓ MẶT Ở ĐÂY:
 *
 *   `asking_as`          — giao diện không hỏi nữa, luôn gửi `MUTATION_ASKING_AS`.
 *   `primary_condition`  — suy ra từ `conditions` lúc gửi, xem `splitConditions`.
 *   `comorbidities`      — như trên.
 *
 * Form giữ một trường `conditions` duy nhất thay cho cặp bệnh chính / bệnh kèm.
 * Nhờ vậy ràng buộc "bệnh kèm không được trùng bệnh chính" biến mất khỏi schema:
 * một danh sách thì không tự trùng với chính nó được, không cần `.refine()` nào
 * đứng canh.
 */
const profileFormSchema = patientProfileSchema
  .omit({
    patient_id: true,
    asking_as: true,
    primary_condition: true,
    comorbidities: true,
  })
  .extend({
    age: z
      .number({ error: 'Bạn hãy điền tuổi bằng số, ví dụ 58.' })
      .int({ error: 'Tuổi phải là số nguyên, ví dụ 58 chứ không phải 58,5.' })
      .min(MIN_AGE, {
        error: `Ứng dụng này dành cho người từ ${MIN_AGE} tuổi trở lên. Bạn hãy kiểm tra lại tuổi vừa điền.`,
      })
      .max(MAX_AGE, {
        error: `Tuổi phải nằm trong khoảng ${MIN_AGE} đến ${MAX_AGE}. Bạn hãy kiểm tra lại số vừa điền.`,
      }),
    // Chọn được một hoặc cả hai, nhưng không được bỏ trắng: cả sản phẩm xoay
    // quanh đúng hai bệnh này, không biết người dùng mắc bệnh nào thì trợ lý
    // không tra được tài liệu nào cả.
    conditions: z.array(primaryConditionSchema).min(1, {
      error: 'Bạn hãy chọn bệnh mà bác sĩ đã chẩn đoán, ít nhất một ô.',
    }),
    diagnosed_at: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
        error: 'Bạn hãy chọn tháng và năm, ví dụ tháng 3 năm 2026.',
      })
      .nullable(),
    // Hai trường thể trạng: bỏ trống là `null`, điền thì phải nằm trong khoảng
    // của hợp đồng. `.nullable()` chứ không `.nullish()` để kiểu vào và kiểu ra
    // vẫn trùng nhau, cùng lối với `diagnosed_at` ngay trên.
    height_cm: z
      .number({ error: 'Bạn hãy điền chiều cao bằng số, ví dụ 165, hoặc bỏ trống ô này.' })
      .int({ error: 'Chiều cao điền bằng số nguyên, ví dụ 165 chứ không phải 165,5.' })
      .min(MIN_HEIGHT_CM, {
        error: `Chiều cao phải nằm trong khoảng ${MIN_HEIGHT_CM} đến ${MAX_HEIGHT_CM} cm. Bạn hãy kiểm tra lại số vừa điền.`,
      })
      .max(MAX_HEIGHT_CM, {
        error: `Chiều cao phải nằm trong khoảng ${MIN_HEIGHT_CM} đến ${MAX_HEIGHT_CM} cm. Bạn hãy kiểm tra lại số vừa điền.`,
      })
      .nullable(),
    weight_kg: z
      .number({ error: 'Bạn hãy điền cân nặng bằng số, ví dụ 68.5, hoặc bỏ trống ô này.' })
      .min(MIN_WEIGHT_KG, {
        error: `Cân nặng phải nằm trong khoảng ${MIN_WEIGHT_KG} đến ${MAX_WEIGHT_KG} kg. Bạn hãy kiểm tra lại số vừa điền.`,
      })
      .max(MAX_WEIGHT_KG, {
        error: `Cân nặng phải nằm trong khoảng ${MIN_WEIGHT_KG} đến ${MAX_WEIGHT_KG} kg. Bạn hãy kiểm tra lại số vừa điền.`,
      })
      .nullable(),
  })

type ProfileFormValues = z.infer<typeof profileFormSchema>

/**
 * Tự kiểm lúc nạp module: ràng buộc của form phải khớp ràng buộc hợp đồng.
 *
 * Thông báo lỗi thì viết lại bằng lời thường, nhưng RANH GIỚI hợp lệ thì không
 * được lệch. Nếu ai đó sửa `schemas.ts` mà quên file này, chỗ này ném ngay lúc
 * nạp thay vì để backend trả 422 giữa mặt người bệnh.
 * Cùng lối tự kiểm mà `mocks/fixtures.ts` đang dùng.
 */
function assertMatchesContract(): void {
  const base = {
    patient_id: 'x',
    age: 58,
    primary_condition: 'hypertension',
    comorbidities: [],
    diagnosed_at: null,
  }

  const samples: { patch: Record<string, unknown>; valid: boolean }[] = [
    { patch: { age: MIN_AGE - 1 }, valid: false },
    { patch: { age: MIN_AGE }, valid: true },
    { patch: { age: MAX_AGE }, valid: true },
    { patch: { age: MAX_AGE + 1 }, valid: false },
    { patch: { age: 58.5 }, valid: false },
    // Chiều cao và cân nặng bỏ trống được, nên `null` phải qua.
    { patch: { height_cm: null, weight_kg: null }, valid: true },
    { patch: { height_cm: MIN_HEIGHT_CM - 1 }, valid: false },
    { patch: { height_cm: MIN_HEIGHT_CM }, valid: true },
    { patch: { height_cm: MAX_HEIGHT_CM }, valid: true },
    { patch: { height_cm: MAX_HEIGHT_CM + 1 }, valid: false },
    { patch: { height_cm: 165.5 }, valid: false },
    { patch: { weight_kg: MIN_WEIGHT_KG - 1 }, valid: false },
    { patch: { weight_kg: MIN_WEIGHT_KG }, valid: true },
    { patch: { weight_kg: MAX_WEIGHT_KG }, valid: true },
    { patch: { weight_kg: MAX_WEIGHT_KG + 1 }, valid: false },
    // Hợp đồng chỉ KHUYẾN NGHỊ một chữ số thập phân chứ không ràng buộc, nên
    // nhiều hơn một chữ số vẫn phải qua. Ràng buộc lại ở đây là frontend trả về
    // 422 giả cho một giá trị mà backend chấp nhận.
    { patch: { weight_kg: 70.35 }, valid: true },
  ]

  for (const { patch, valid } of samples) {
    const contractOk = patientProfileSchema.safeParse({ ...base, ...patch }).success

    if (contractOk !== valid) {
      throw new Error(
        `ProfileScreen: ràng buộc của ${JSON.stringify(patch)} trong schemas.ts đã đổi ` +
          `(hợp đồng nói ${contractOk ? 'hợp lệ' : 'không hợp lệ'}, form đang giả định ${valid ? 'hợp lệ' : 'không hợp lệ'}). ` +
          'Hãy cập nhật hằng số khoảng giá trị và thông báo lỗi trong ProfileScreen.tsx.',
      )
    }
  }
}

assertMatchesContract()

// ---------------------------------------------------------------------------
// Ba bước
// ---------------------------------------------------------------------------

/**
 * THỨ TỰ BA BƯỚC, và vì sao tuổi đứng trước.
 *
 * Tuổi, chiều cao và cân nặng là ba con số người dùng trả lời được ngay mà
 * không phải cân nhắc gì — mở đầu bằng chúng thì người dùng vào guồng trước khi
 * gặp câu khó hơn.
 *
 * Bước 3 hiện chỉ còn một câu, vì bệnh nền đã nhập chung vào câu hỏi bệnh ở
 * bước 2. Cứ để vậy: chỗ trống đó dành cho phần dị ứng sẽ thêm sau.
 */
const STEP_TITLES = [
  'Tuổi và thể trạng',
  'Bệnh đã được chẩn đoán',
  'Thời điểm chẩn đoán',
] as const

/** Trường nào thuộc bước nào, để chỉ validate đúng phần người dùng vừa điền. */
const STEP_FIELDS: FieldPath<ProfileFormValues>[][] = [
  ['age', 'height_cm', 'weight_kg'],
  ['conditions'],
  ['diagnosed_at'],
]

const LAST_STEP = STEP_TITLES.length - 1

// ---------------------------------------------------------------------------
// Ô chọn
// ---------------------------------------------------------------------------

/**
 * Một lựa chọn bấm được, dùng chung cho cả chọn một và chọn nhiều.
 *
 * Bên trong vẫn là `input` thật (radio hoặc checkbox) nhưng ẩn đi, chỉ hiện
 * phần `span` đã tạo dáng. Giữ input thật để được miễn phí toàn bộ hành vi bàn
 * phím gốc: nhóm radio đi bằng phím mũi tên, checkbox bật tắt bằng phím cách,
 * và trình đọc màn hình đọc đúng "đã chọn / chưa chọn".
 *
 * `peer-focus-visible` cần thiết vì input bị `sr-only` — viền focus toàn cục ở
 * `index.css` sẽ vẽ lên một phần tử vô hình, nên phải chuyển sang phần nhìn thấy.
 */
function ChoiceOption({
  type,
  name,
  value,
  label,
  checked,
  onChange,
}: {
  type: 'radio' | 'checkbox'
  name: string
  value: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="block cursor-pointer">
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      {/* Mọi biến thể `peer-*` phải nằm trên chính thẻ ANH EM của input — biến
          thể sinh ra selector `.peer:checked ~ &`, nên đặt xuống thẻ con bên
          trong là không bao giờ khớp. Vì vậy cả nền, viền, màu chữ lẫn độ đậm
          đều gom hết lên thẻ này rồi để thẻ con thừa kế. */}
      <span
        className="
          font-display block min-h-touch rounded-lg border-2 border-border p-cozy text-ink
          peer-checked:border-medical peer-checked:bg-medical peer-checked:font-semibold peer-checked:text-paper
          peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-medical
        "
      >
        <span className="block text-notice">{label}</span>
      </span>
    </label>
  )
}

/** Dòng giải thích ngắn dưới nhãn: vì sao ứng dụng cần thông tin này. */
function FieldHint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="font-display mt-hair text-question text-moss">
      {children}
    </p>
  )
}

/** Lỗi hiện ngay dưới trường của nó, không gom về cuối form. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (message === undefined) return null
  return (
    <p id={id} role="alert" className="font-display mt-tight text-question text-alert">
      {message}
    </p>
  )
}

/** Nhãn của một trường. Tối thiểu 17px theo sàn cỡ chữ. */
const FIELD_LABEL_CLASS = 'font-display block text-input font-semibold text-ink'

/** Ô nhập một dòng: số, tháng năm. Cao tối thiểu 44px như mọi vùng chạm khác. */
const FIELD_INPUT_CLASS =
  'font-body mt-snug min-h-touch w-full rounded-lg border-2 border-border bg-paper p-snug text-input text-ink'

/**
 * Ô số để trống trả về chuỗi rỗng, mà hợp đồng chờ `null` — đổi ngay ở đây.
 *
 * Không dùng `valueAsNumber` của React Hook Form cho hai ô không bắt buộc: ô
 * trống sẽ thành `NaN`, và `NaN` không phải `null` nên schema báo lỗi ngay khi
 * người dùng chỉ đơn giản là bỏ qua ô đó.
 */
function toOptionalNumber(raw: string): number | null {
  return raw === '' ? null : Number(raw)
}

// ---------------------------------------------------------------------------
// Màn hình
// ---------------------------------------------------------------------------

export function ProfileScreen() {
  const { patientId, profile, profileState, profileError, reloadProfile } = usePatient()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [step, setStep] = useState(0)

  const isEditing = profile !== null

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    trigger,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      age: undefined,
      conditions: [],
      diagnosed_at: null,
      height_cm: null,
      weight_kg: null,
    },
  })

  const conditions = watch('conditions') ?? []

  // Hồ sơ tới sau lần render đầu (đang gọi API), nên phải nạp lại vào form khi có.
  //
  // Đây là chiều ngược của `splitConditions`: hợp đồng giữ hai trường, form giữ
  // một danh sách, nên nạp lại là gộp chúng về một. Lọc qua `CONDITIONS` để thứ
  // tự luôn cố định, và để một hồ sơ cũ lỡ có bệnh kèm trùng bệnh chính cũng
  // chỉ làm sáng lên một ô chứ không sinh mục trùng.
  useEffect(() => {
    if (profile === null) return
    const saved = [profile.primary_condition, ...(profile.comorbidities ?? [])]
    reset({
      age: profile.age,
      conditions: CONDITIONS.filter((condition) => saved.includes(condition)),
      diagnosed_at: profile.diagnosed_at ?? null,
      height_cm: profile.height_cm ?? null,
      weight_kg: profile.weight_kg ?? null,
    })
  }, [profile, reset])

  const mutation = useMutation({
    mutationFn: async (values: ProfileFormValues): Promise<PatientProfileResponse> => {
      // `patient_id` đến từ response đăng nhập, client không còn tự sinh nữa.
      // Guard `RequireRole role="patient"` đã chặn từ tầng điều hướng, và schema
      // hợp đồng bắt tài khoản `patient` phải có `patient_id` — nên nhánh này
      // không xảy ra được. Vẫn ném để nếu một trong hai lớp kia bị gỡ thì hỏng
      // ngay tại đây, thay vì lặng lẽ gửi lên máy chủ một hồ sơ vô chủ.
      if (patientId === null) {
        throw new Error(
          'Không có patient_id khi lưu hồ sơ. Guard vai trò đáng lẽ đã chặn trước đó.',
        )
      }

      // Một danh sách bệnh ở giao diện tách lại thành hai trường của hợp đồng.
      // Hồ sơ cũ truyền vào để giữ nguyên bệnh chính đã lưu nếu nó vẫn đang
      // được chọn — quy tắc đầy đủ ở `splitConditions`.
      const { primary, comorbidities } = splitConditions(
        values.conditions,
        profile?.primary_condition ?? null,
      )

      return upsertPatientProfile({
        patient_id: patientId,
        age: values.age,
        primary_condition: primary,
        comorbidities,
        diagnosed_at: values.diagnosed_at,
        // Trường này vẫn thuộc hợp đồng, giao diện chỉ chưa cho chọn.
        asking_as: MUTATION_ASKING_AS,
        height_cm: values.height_cm,
        weight_kg: values.weight_kg,
      })
    },
    onSuccess: (saved) => {
      // Nạp thẳng kết quả vừa lưu vào cache, khỏi chờ một vòng GET nữa — thanh
      // bên và màn chat thấy hồ sơ mới ngay khi chuyển màn.
      queryClient.setQueryData(patientProfileQueryKey(saved.patient_id), saved)
      void navigate('/chat', { replace: true })
    },
  })

  const submitProfile = handleSubmit((values) => mutation.mutate(values))

  /**
   * LỚP HAI: form chỉ được lưu khi đang đứng ở bước cuối.
   *
   * Chốt này dành cho phím Enter. Trình duyệt tự submit form khi người dùng bấm
   * Enter (implicit submission của HTML), và ở bước chưa cuối thì Enter phải
   * được hiểu là "đi tiếp" chứ không phải "lưu".
   *
   * MỘT MÌNH NÓ KHÔNG ĐỦ, và đừng dựa vào nó để gộp hai nút ở cuối form lại.
   * `step` đọc ở đây là giá trị SAU khi `goNext` đã tăng bước. Với một sự kiện
   * submit sinh ra ngay trong lúc chuyển bước — đúng cái mà biểu thức ba ngôi
   * cũ tạo ra — thì điều kiện này đã đúng và cho đi qua, hồ sơ được lưu và người
   * dùng bị đẩy sang `/chat`. Lớp một nằm ở khối nút cuối form, đọc ghi chú ở
   * đó trước khi sửa chỗ này.
   */
  function onFormSubmit(event: FormEvent<HTMLFormElement>): void {
    if (step !== LAST_STEP) {
      event.preventDefault()
      void goNext()
      return
    }
    void submitProfile(event)
  }

  /**
   * Bật tắt một bệnh ở bước 2.
   *
   * Dựng lại danh sách theo thứ tự của `CONDITIONS` chứ không nối thêm vào
   * cuối: thứ tự trong form khi đó không phụ thuộc người dùng bấm ô nào trước,
   * nên `splitConditions` luôn cho cùng một kết quả với cùng một lựa chọn.
   */
  function toggleCondition(condition: PrimaryCondition, isChecked: boolean): void {
    setValue(
      'conditions',
      CONDITIONS.filter((candidate) =>
        candidate === condition ? isChecked : conditions.includes(candidate),
      ),
      { shouldValidate: true },
    )
  }

  async function goNext(): Promise<void> {
    const isStepValid = await trigger(STEP_FIELDS[step])
    if (!isStepValid) return
    setStep((current) => Math.min(current + 1, LAST_STEP))
  }

  function goBack(): void {
    setStep((current) => Math.max(current - 1, 0))
  }

  /**
   * Đường thoát cho người chưa muốn khai.
   *
   * Bắt khai đủ bốn trường trước khi cho hỏi câu nào là cách chắc chắn nhất để
   * mất người dùng ở màn đầu tiên. Cho vào thẳng màn hỏi đáp; ở đó có dải nhắc
   * rằng câu trả lời chưa được đặt vào bệnh và tuổi của họ, kèm đường quay lại
   * đây.
   *
   * `patient_id` đã có sẵn từ lúc đăng nhập nên ở đây không phải sinh gì cả —
   * hội thoại họ hỏi trong lúc chưa khai hồ sơ vẫn được lưu đúng vào tài khoản.
   */
  function skipProfile(): void {
    void navigate('/chat', { replace: true })
  }

  // Đang đọc hồ sơ cũ thì chưa dựng form, tránh cảnh ô trống rồi nhảy số.
  if (profileState === 'loading') {
    return (
      <p role="status" className="font-display max-w-answer text-notice text-moss">
        Đang mở hồ sơ của bạn…
      </p>
    )
  }

  return (
    <div className="max-w-answer">
      <h1 className="font-display text-ask font-bold">
        {isEditing ? 'Sửa hồ sơ sức khỏe' : 'Trước khi bắt đầu'}
      </h1>

      {/* Ba điều này là giới hạn của công cụ, không phải lời chào một lần rồi
          thôi, nên người quay lại sửa hồ sơ thấy y hệt người khai lần đầu. */}
      <div className="mt-block">
        <ProfileIntro />
      </div>

      {profileState === 'error' && (
        <div className="mt-block">
          <ErrorNotice
            error={profileError}
            retryLabel="Đọc lại hồ sơ"
            onRetry={reloadProfile}
          />
        </div>
      )}

      <div className="mt-block">
        <StepProgress
          current={step + 1}
          total={STEP_TITLES.length}
          title={STEP_TITLES[step]}
        />
      </div>

      <form onSubmit={onFormSubmit} noValidate className="mt-block">
        {/* ---- Bước 1: tuổi, chiều cao, cân nặng ----
            Ba con số dễ trả lời nhất, hỏi trước để người dùng vào guồng. */}
        {step === 0 && (
          <>
            <div>
              <label htmlFor="age" className={FIELD_LABEL_CLASS}>
                {LABELS.age}
              </label>
              <FieldHint id="age-hint">{LABELS.ageHint}</FieldHint>
              <input
                id="age"
                type="number"
                inputMode="numeric"
                min={MIN_AGE}
                max={MAX_AGE}
                step={1}
                aria-describedby={errors.age ? 'age-hint age-error' : 'age-hint'}
                aria-invalid={errors.age !== undefined}
                {...register('age', { valueAsNumber: true })}
                className={FIELD_INPUT_CLASS}
              />
              <FieldError id="age-error" message={errors.age?.message} />
            </div>

            {/* ---- Chiều cao và cân nặng ----
                Hỏi chung một nhóm vì chúng được dùng chung một việc: chọn tài
                liệu hợp thể trạng. Cả hai bỏ trống được, và dòng nhắc nói thẳng
                điều đó — người không nhớ số của mình không nên bị kẹt ở đây.

                Không tính và không hiện BMI, cũng không gợi ý cân nặng nên có.
                Hợp đồng mục 4 xếp việc đó vào tư vấn dinh dưỡng cá nhân hoá,
                nằm ngoài phạm vi giáo dục của sản phẩm. */}
            <fieldset className="mt-block">
              <legend className={FIELD_LABEL_CLASS}>{LABELS.body}</legend>
              <FieldHint id="body-hint">{LABELS.bodyHint}</FieldHint>

              <div className="mt-snug">
                <label htmlFor="height_cm" className={FIELD_LABEL_CLASS}>
                  {LABELS.height}
                </label>
                <input
                  id="height_cm"
                  type="number"
                  inputMode="numeric"
                  min={MIN_HEIGHT_CM}
                  max={MAX_HEIGHT_CM}
                  step={1}
                  aria-describedby={
                    errors.height_cm ? 'body-hint height-error' : 'body-hint'
                  }
                  aria-invalid={errors.height_cm !== undefined}
                  {...register('height_cm', { setValueAs: toOptionalNumber })}
                  className={FIELD_INPUT_CLASS}
                />
                <FieldError id="height-error" message={errors.height_cm?.message} />
              </div>

              <div className="mt-snug">
                <label htmlFor="weight_kg" className={FIELD_LABEL_CLASS}>
                  {LABELS.weight}
                </label>
                <input
                  id="weight_kg"
                  type="number"
                  inputMode="decimal"
                  min={MIN_WEIGHT_KG}
                  max={MAX_WEIGHT_KG}
                  // Một chữ số thập phân là KHUYẾN NGHỊ của hợp đồng chứ không
                  // phải ràng buộc: `step` chỉ đặt nhịp cho nút tăng giảm, form
                  // đã `noValidate` nên trình duyệt không chặn số lẻ hơn.
                  step={0.1}
                  aria-describedby={
                    errors.weight_kg ? 'body-hint weight-error' : 'body-hint'
                  }
                  aria-invalid={errors.weight_kg !== undefined}
                  {...register('weight_kg', { setValueAs: toOptionalNumber })}
                  className={FIELD_INPUT_CLASS}
                />
                <FieldError id="weight-error" message={errors.weight_kg?.message} />
              </div>
            </fieldset>
          </>
        )}

        {/* ---- Bước 2: bệnh đã được chẩn đoán ----
            MỘT câu cho cả hai bệnh, dùng hộp kiểm chứ không phải ô chọn một.
            Người mắc đồng thời đái tháo đường và tăng huyết áp không tự xếp
            bệnh nào là chính, mà hỏi họ điều đó cũng không giúp gì cho câu trả
            lời — việc tách `primary_condition` với `comorbidities` là yêu cầu
            của hợp đồng API, và nó được xử lý ở `splitConditions` lúc gửi. */}
        {step === 1 && (
          <fieldset>
            <legend className={FIELD_LABEL_CLASS}>{LABELS.conditions}</legend>
            <FieldHint id="conditions-hint">{LABELS.conditionsHint}</FieldHint>

            <div
              className="mt-snug space-y-snug"
              aria-describedby={
                errors.conditions ? 'conditions-hint conditions-error' : 'conditions-hint'
              }
            >
              {CONDITIONS.map((condition) => (
                <ChoiceOption
                  key={condition}
                  type="checkbox"
                  name="conditions"
                  value={condition}
                  label={CONDITION_LABEL[condition]}
                  checked={conditions.includes(condition)}
                  onChange={(isChecked) => toggleCondition(condition, isChecked)}
                />
              ))}
            </div>
            <FieldError id="conditions-error" message={errors.conditions?.message} />
          </fieldset>
        )}

        {/* ---- Bước 3: thời điểm chẩn đoán ----
            Câu khó nhớ nhất để cuối, và nó bỏ trống được. */}
        {step === 2 && (
          <>
            <div>
              <label htmlFor="diagnosed_at" className={FIELD_LABEL_CLASS}>
                {LABELS.diagnosed}
              </label>
              <FieldHint id="diagnosed-hint">{LABELS.diagnosedHint}</FieldHint>
              <input
                id="diagnosed_at"
                type="month"
                aria-describedby={
                  errors.diagnosed_at ? 'diagnosed-hint diagnosed-error' : 'diagnosed-hint'
                }
                aria-invalid={errors.diagnosed_at !== undefined}
                // Ô trống trả về chuỗi rỗng, mà hợp đồng chờ `null` — đổi ngay ở đây.
                {...register('diagnosed_at', {
                  setValueAs: (raw: string) => (raw === '' ? null : raw),
                })}
                className={FIELD_INPUT_CLASS}
              />
              <FieldError id="diagnosed-error" message={errors.diagnosed_at?.message} />
            </div>

            {mutation.isError && (
              <div className="mt-block">
                <ErrorNotice
                  error={mutation.error}
                  retryLabel="Lưu lại"
                  onRetry={() => void submitProfile()}
                />
              </div>
            )}
          </>
        )}

        {/* ---- Đi lui, đi tới ----
            "Quay lại" giữ bề ngang vừa đủ chữ, nút chính ăn hết chỗ còn lại —
            trên điện thoại nó là mảng lớn nhất, khó bấm nhầm sang nút lui. Bước
            1 không có nút lui vì không có chỗ nào để lui về.

            HAI NÚT CHÍNH LÀ HAI Ô CON RIÊNG BIỆT. ĐỪNG GỘP LẠI THÀNH MỘT BIỂU
            THỨC BA NGÔI. Đây là nguyên nhân của một lỗi thật, không phải sở
            thích trình bày:

            Viết `{cond ? <button type="button"/> : <button type="submit"/>}` thì
            hai nhánh nằm cùng MỘT ô con và cùng loại phần tử `button`, nên React
            không dựng nút mới mà dùng lại đúng node DOM cũ, chỉ vá thuộc tính —
            trong đó có `type`. Bấm "Tiếp tục" ở bước áp chót thì `goNext` chạy
            `await trigger(...)` rồi `setStep`, mà microtask lại chạy xong ngay
            khi listener trả về, tức TRƯỚC lúc trình duyệt thực thi activation
            behavior của nút vừa bấm. React kịp đổi `type` của chính node đó
            thành `submit`, trình duyệt thấy một nút submit và gửi form. Lúc ấy
            `step` đã bằng `LAST_STEP` nên chốt trong `onFormSubmit` cũng cho
            qua: hồ sơ bị lưu và người dùng bị đẩy sang `/chat` giữa chừng.

            Tách làm hai ô con thì mỗi nút có vị trí riêng: React THÁO hẳn nút
            "Tiếp tục" và GẮN một nút "Lưu" mới. Node vừa được bấm rời khỏi tài
            liệu nên không còn form owner, không submit được gì; còn nút submit
            là node mới toanh, chưa hề nhận cú bấm nào. */}
        <div className="mt-block flex gap-snug">
          {step > 0 && (
            <button
              type="button"
              onClick={goBack}
              className="font-display min-h-touch rounded-lg border-2 border-border px-cozy text-input font-semibold text-ink"
            >
              Quay lại
            </button>
          )}

          {step < LAST_STEP && (
            <button
              type="button"
              onClick={() => void goNext()}
              className="font-display min-h-touch flex-1 rounded-lg border-2 border-medical bg-medical px-cozy text-input font-bold text-paper"
            >
              Tiếp tục
            </button>
          )}

          {/* `type="submit"` giữ nguyên: ở bước cuối, Enter trong ô nhập phải
              lưu được hồ sơ như mọi form khác. */}
          {step === LAST_STEP && (
            <button
              type="submit"
              disabled={mutation.isPending}
              className="font-display min-h-touch flex-1 rounded-lg border-2 border-medical bg-medical px-cozy text-input font-bold text-paper disabled:border-rule disabled:bg-transparent disabled:font-normal disabled:text-moss"
            >
              {mutation.isPending
                ? 'Đang lưu…'
                : isEditing
                  ? 'Lưu thay đổi'
                  : 'Lưu và bắt đầu hỏi'}
            </button>
          )}
        </div>

        {mutation.isPending && (
          <p role="status" className="font-display mt-tight text-question text-moss">
            Đang lưu hồ sơ…
          </p>
        )}

        {/* ---- Đường thoát, chỉ ở bước 1 ---- */}
        {step === 0 && !isEditing && (
          <div className="mt-block border-t border-rule pt-snug">
            <button
              type="button"
              onClick={skipProfile}
              className="font-display flex min-h-touch items-center text-input font-semibold text-medical underline underline-offset-4"
            >
              Bỏ qua, tôi muốn thử hỏi một câu trước
            </button>
            <p className="font-display mt-hair text-question text-moss">
              Bạn vẫn hỏi được ngay. Chỉ là câu trả lời chưa đặt được vào bệnh và
              tuổi của bạn, nên sẽ chung chung hơn. Khai hồ sơ lúc nào cũng được.
            </p>
          </div>
        )}
      </form>
    </div>
  )
}
