/**
 * Màn khai hồ sơ — cũng là màn đầu tiên người dùng mới nhìn thấy.
 *
 * Không còn màn chọn vai trò đứng trước. Vai trò phải đến từ tài khoản, không
 * phải từ việc người dùng tự khai, nên bước đó đã bỏ hẳn (xem `app/guards.tsx`).
 *
 * BỐ CỤC:
 *
 *   1. Ba điều cần nói  — giới hạn của công cụ, đọc trước khi khai bất cứ gì.
 *                        Hiện ở cả lần khai đầu lẫn lúc quay lại sửa; chỉ phần
 *                        "Xem chi tiết" là mặc định thu gọn với người quay lại.
 *   2. Form ba bước      — tuổi và thể trạng, rồi vai trò và bệnh chính, rồi
 *                        bệnh kèm và mốc chẩn đoán. Xem `STEP_TITLES`.
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
  askingAsSchema,
  patientProfileSchema,
  primaryConditionSchema,
  type AskingAs,
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
 * Nhãn của bước 1, viết TRUNG TÍNH vì lúc đó chưa biết người dùng là ai.
 *
 * Bước hỏi vai trò nay đứng sau bước này, nên ở đây không được xưng hô: hỏi
 * "bạn bao nhiêu tuổi" thì người đang hỏi giúp mẹ mình sẽ điền tuổi của chính
 * họ, và cả hồ sơ thành sai — đúng cái lỗi mà cặp nhãn `self`/`caregiver` bên
 * dưới sinh ra để tránh.
 *
 * Cách tránh là gọi thẳng đối tượng của hồ sơ: "người bệnh". Với người tự hỏi
 * cho mình thì đó là họ, với người chăm sóc thì đó là người nhà — câu vẫn đúng
 * cho cả hai mà không cần biết trước là ai. Dòng nhắc của ô tuổi nói rõ thêm
 * một lần nữa, vì đó là ô duy nhất mà điền nhầm người sẽ không ai phát hiện ra.
 */
const NEUTRAL_LABELS = {
  age: 'Người bệnh bao nhiêu tuổi?',
  ageHint:
    'Điền tuổi của người đang mắc bệnh. Nếu bạn hỏi giúp người nhà thì đây là ' +
    'tuổi của người đó, không phải tuổi của bạn — bước sau sẽ hỏi bạn đang hỏi ' +
    'cho ai.',
  body: 'Chiều cao và cân nặng của người bệnh',
  bodyHint:
    'Không bắt buộc, bạn có thể bỏ trống cả hai ô này. Trợ lý dùng hai số đó ' +
    'để chọn tài liệu phù hợp với thể trạng.',
  height: 'Cao bao nhiêu? (tính bằng cm)',
  weight: 'Nặng bao nhiêu? (tính bằng kg)',
} as const

type StepLabels = {
  comorbidities: string
  comorbiditiesHint: string
  diagnosed: string
  diagnosedHint: string
}

/**
 * Cùng một câu hỏi, hai cách xưng hô.
 *
 * Người chăm sóc mà bị hỏi "bạn được chẩn đoán từ khi nào" sẽ trả lời về chính
 * họ, và cả hồ sơ thành sai. Viết hẳn hai bản thay vì ghép chuỗi từ một biến
 * chủ ngữ: tiếng Việt đổi chủ ngữ thì trật tự và từ nối cũng đổi theo.
 *
 * Chỉ còn các câu của bước 3, tức những câu hỏi SAU khi đã biết vai trò. Câu
 * của bước 1 nằm ở `NEUTRAL_LABELS` ngay trên.
 */
const LABELS: Record<AskingAs, StepLabels> = {
  self: {
    comorbidities: 'Bạn có mắc thêm bệnh nào dưới đây không?',
    comorbiditiesHint:
      'Nếu có, trợ lý sẽ lưu ý những điều cần tránh khi mắc cùng lúc hai bệnh. ' +
      'Nếu không có thì bạn cứ bỏ trống mục này.',
    diagnosed: 'Bạn được chẩn đoán từ khi nào?',
    diagnosedHint:
      'Không bắt buộc. Biết bạn mắc bệnh bao lâu rồi giúp lời khuyên sát hơn. ' +
      'Không nhớ chính xác thì bạn cứ bỏ trống.',
  },
  caregiver: {
    comorbidities: 'Người bạn chăm sóc có mắc thêm bệnh nào dưới đây không?',
    comorbiditiesHint:
      'Nếu có, trợ lý sẽ lưu ý những điều cần tránh khi mắc cùng lúc hai bệnh. ' +
      'Nếu không có thì bạn cứ bỏ trống mục này.',
    diagnosed: 'Người đó được chẩn đoán từ khi nào?',
    diagnosedHint:
      'Không bắt buộc. Biết người đó mắc bệnh bao lâu rồi giúp lời khuyên sát hơn. ' +
      'Không nhớ chính xác thì bạn cứ bỏ trống.',
  },
}

// ---------------------------------------------------------------------------
// Ba lựa chọn mở đầu
// ---------------------------------------------------------------------------

/**
 * Một thẻ ở bước 2.
 *
 * Hai thẻ đầu gộp luôn "ai hỏi" với "bệnh gì" — người bệnh tự hỏi cho mình là
 * đường đi phổ biến nhất, và hỏi họ hai câu để lấy một thông tin là thừa. Thẻ
 * thứ ba tách ra vì lúc đó bệnh là của người khác, phải hỏi riêng.
 */
type WhoChoice = {
  id: string
  label: string
  description: string
  askingAs: AskingAs
  /** `null` nghĩa là còn phải hỏi thêm bệnh ở bước phụ ngay bên dưới. */
  condition: PrimaryCondition | null
}

const WHO_CHOICES: readonly WhoChoice[] = [
  {
    id: 'self-diabetes',
    label: 'Tôi bị tiểu đường',
    description: 'Bác sĩ chẩn đoán tôi mắc đái tháo đường típ 2.',
    askingAs: 'self',
    condition: 'type2_diabetes',
  },
  {
    id: 'self-hypertension',
    label: 'Tôi bị cao huyết áp',
    description: 'Bác sĩ chẩn đoán tôi mắc tăng huyết áp.',
    askingAs: 'self',
    condition: 'hypertension',
  },
  {
    id: 'caregiver',
    label: 'Tôi hỏi giúp người nhà',
    description: 'Tôi đang chăm sóc cho người bệnh trong nhà.',
    askingAs: 'caregiver',
    condition: null,
  },
]

/** Thẻ nào đang được chọn, suy ra từ giá trị form chứ không giữ thêm state riêng. */
function selectedWhoId(
  askingAs: AskingAs | undefined,
  condition: PrimaryCondition | undefined,
): string | null {
  if (askingAs === 'caregiver') return 'caregiver'
  if (askingAs === 'self' && condition !== undefined) {
    return condition === 'type2_diabetes' ? 'self-diabetes' : 'self-hypertension'
  }
  return null
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
 * Có một ràng buộc thêm mà hợp đồng không có: bệnh nền không được trùng bệnh
 * chính. Backend chấp nhận, nhưng với người bệnh thì "bệnh chính: tăng huyết áp,
 * bệnh kèm: tăng huyết áp" là vô nghĩa.
 */
const profileFormSchema = patientProfileSchema
  .omit({ patient_id: true })
  .extend({
    asking_as: z.enum(askingAsSchema.options, {
      error: 'Bạn hãy chọn một trong ba ô ở trên.',
    }),
    age: z
      .number({ error: 'Bạn hãy điền tuổi bằng số, ví dụ 58.' })
      .int({ error: 'Tuổi phải là số nguyên, ví dụ 58 chứ không phải 58,5.' })
      .min(MIN_AGE, {
        error: `Ứng dụng này dành cho người từ ${MIN_AGE} tuổi trở lên. Bạn hãy kiểm tra lại tuổi vừa điền.`,
      })
      .max(MAX_AGE, {
        error: `Tuổi phải nằm trong khoảng ${MIN_AGE} đến ${MAX_AGE}. Bạn hãy kiểm tra lại số vừa điền.`,
      }),
    primary_condition: z.enum(CONDITIONS, {
      error: 'Bạn hãy chọn bệnh mà bác sĩ đã chẩn đoán.',
    }),
    comorbidities: z.array(primaryConditionSchema),
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
  .refine((value) => !value.comorbidities.includes(value.primary_condition), {
    error:
      'Bệnh bạn chọn ở mục bệnh kèm đang trùng với bệnh chính. Bạn hãy bỏ chọn ở mục bệnh kèm.',
    path: ['comorbidities'],
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
 * gặp câu khó hơn. Câu "bạn hỏi cho ai" tuy ngắn nhưng buộc người ta phải đọc
 * ba thẻ rồi tự xếp mình vào một nhóm, đặt ngay ở màn đầu tiên là một rào chắn.
 *
 * Cái giá phải trả: bước 1 chưa biết vai trò nên không xưng hô được. Xem
 * `NEUTRAL_LABELS`.
 */
const STEP_TITLES = [
  'Tuổi và thể trạng',
  'Bạn hỏi cho ai',
  'Bệnh kèm và thời điểm chẩn đoán',
] as const

/** Trường nào thuộc bước nào, để chỉ validate đúng phần người dùng vừa điền. */
const STEP_FIELDS: FieldPath<ProfileFormValues>[][] = [
  ['age', 'height_cm', 'weight_kg'],
  ['asking_as', 'primary_condition'],
  ['comorbidities', 'diagnosed_at'],
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
  description,
  checked,
  onChange,
}: {
  type: 'radio' | 'checkbox'
  name: string
  value: string
  label: string
  /** Chỉ thẻ lớn ở bước 1 mới có dòng giải thích bên dưới nhãn. */
  description?: string
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
        {description !== undefined && (
          <span className="mt-hair block text-question">{description}</span>
        )}
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
    resetField,
    reset,
    trigger,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      asking_as: undefined,
      age: undefined,
      primary_condition: undefined,
      comorbidities: [],
      diagnosed_at: null,
      height_cm: null,
      weight_kg: null,
    },
  })

  const askingAs = watch('asking_as')
  const primaryCondition = watch('primary_condition')
  const comorbidities = watch('comorbidities') ?? []

  const labels = LABELS[askingAs ?? 'self']

  // Hồ sơ tới sau lần render đầu (đang gọi API), nên phải nạp lại vào form khi có.
  useEffect(() => {
    if (profile === null) return
    reset({
      asking_as: profile.asking_as,
      age: profile.age,
      primary_condition: profile.primary_condition,
      comorbidities: profile.comorbidities ?? [],
      diagnosed_at: profile.diagnosed_at ?? null,
      height_cm: profile.height_cm ?? null,
      weight_kg: profile.weight_kg ?? null,
    })
  }, [profile, reset])

  // Đổi bệnh chính sang đúng bệnh đang chọn ở mục bệnh kèm thì tự bỏ chọn bên
  // kia, để người dùng không phải tự gỡ một lỗi mà họ không gây ra.
  useEffect(() => {
    if (primaryCondition === undefined) return
    if (comorbidities.includes(primaryCondition)) {
      setValue(
        'comorbidities',
        comorbidities.filter((condition) => condition !== primaryCondition),
        { shouldValidate: true },
      )
    }
  }, [primaryCondition, comorbidities, setValue])

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

      return upsertPatientProfile({
        patient_id: patientId,
        age: values.age,
        primary_condition: values.primary_condition,
        comorbidities: values.comorbidities,
        diagnosed_at: values.diagnosed_at,
        asking_as: values.asking_as,
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
   * Form chỉ được LƯU khi đang đứng ở bước cuối.
   *
   * Đây là chỗ hỏng của màn sửa hồ sơ. Trình duyệt tự submit form khi người dùng
   * bấm Enter (implicit submission của HTML): form không có nút submit nào đang
   * hiện ở bước 1 và bước 2, mà hai bước đó cũng không có trường nào thuộc loại
   * chặn implicit submission — chỉ có ô chọn và hộp kiểm — nên Enter đi thẳng
   * vào `onSubmit` của form.
   *
   * Với người khai lần đầu thì không ai thấy: `age` còn trống nên schema chặn
   * lại, không có gì xảy ra. Với người QUAY LẠI SỬA thì `reset(profile)` đã điền
   * sẵn mọi trường bằng dữ liệu hợp lệ, nên form qua schema ngay ở bước 1: hồ sơ
   * được lưu và `onSuccess` đẩy thẳng sang `/chat`. Người dùng bị văng khỏi màn
   * sửa trước khi kịp nhìn thấy ô tuổi, chiều cao, cân nặng.
   *
   * Chặn bằng chính điều kiện của bước chứ không bằng cách bỏ nút hay bắt phím:
   * mọi đường dẫn tới submit đều đi qua đây. Enter ở bước chưa cuối được hiểu là
   * "đi tiếp" — đúng thứ người dùng định làm khi bấm phím đó.
   */
  function onFormSubmit(event: FormEvent<HTMLFormElement>): void {
    if (step !== LAST_STEP) {
      event.preventDefault()
      void goNext()
      return
    }
    void submitProfile(event)
  }

  /** Chọn một thẻ ở bước 2. */
  function pickWho(choice: WhoChoice): void {
    setValue('asking_as', choice.askingAs, { shouldValidate: true })

    if (choice.condition !== null) {
      setValue('primary_condition', choice.condition, { shouldValidate: true })
      return
    }

    // Vừa chuyển sang "hỏi giúp người nhà": bệnh vừa chọn là bệnh của NGƯỜI
    // DÙNG, không phải của người được chăm sóc, nên phải hỏi lại từ đầu. Chỉ xóa
    // khi thực sự đổi trạng thái — bấm lại đúng thẻ đang chọn thì để yên.
    if (askingAs !== 'caregiver') {
      resetField('primary_condition')
    }
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

  const otherConditions = CONDITIONS.filter(
    (condition) => condition !== primaryCondition,
  )
  const selectedWho = selectedWhoId(askingAs, primaryCondition)

  return (
    <div className="max-w-answer">
      <h1 className="font-display text-ask font-bold">
        {isEditing ? 'Sửa hồ sơ sức khỏe' : 'Trước khi bắt đầu'}
      </h1>

      {/* Bản ba dòng ngắn hiện ở CẢ HAI trường hợp. Ba điều này là giới hạn của
          công cụ, không phải lời chào một lần rồi thôi — người quay lại sửa hồ
          sơ vẫn cần thấy chúng.

          Khác biệt duy nhất nằm ở phần "Xem chi tiết": người khai lần đầu chưa
          biết gì nên mở sẵn, người quay lại đã đọc rồi nên để thu gọn, khỏi
          phải cuộn qua lần nữa chỉ để đổi một con số. */}
      <div className="mt-block">
        <ProfileIntro defaultExpanded={!isEditing} />
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
            Ba con số dễ trả lời nhất, hỏi trước để người dùng vào guồng. Nhãn
            trung tính vì bước hỏi vai trò còn ở phía sau. */}
        {step === 0 && (
          <>
            <div>
              <label htmlFor="age" className={FIELD_LABEL_CLASS}>
                {NEUTRAL_LABELS.age}
              </label>
              <FieldHint id="age-hint">{NEUTRAL_LABELS.ageHint}</FieldHint>
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
              <legend className={FIELD_LABEL_CLASS}>{NEUTRAL_LABELS.body}</legend>
              <FieldHint id="body-hint">{NEUTRAL_LABELS.bodyHint}</FieldHint>

              <div className="mt-snug">
                <label htmlFor="height_cm" className={FIELD_LABEL_CLASS}>
                  {NEUTRAL_LABELS.height}
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
                  {NEUTRAL_LABELS.weight}
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

        {/* ---- Bước 2: người hỏi là ai, và bệnh chính ---- */}
        {step === 1 && (
          <>
            <fieldset>
              <legend className={FIELD_LABEL_CLASS}>
                Bạn hỏi cho ai, và về bệnh gì?
              </legend>
              <FieldHint id="who-hint">
                Bạn chọn một ô. Nếu bạn hỏi giúp người nhà, những câu sau sẽ hỏi
                về người đó chứ không phải về bạn.
              </FieldHint>

              <div
                className="mt-snug space-y-snug"
                aria-describedby={errors.asking_as ? 'who-hint who-error' : 'who-hint'}
              >
                {WHO_CHOICES.map((choice) => (
                  <ChoiceOption
                    key={choice.id}
                    type="radio"
                    name="who"
                    value={choice.id}
                    label={choice.label}
                    description={choice.description}
                    checked={selectedWho === choice.id}
                    onChange={() => pickWho(choice)}
                  />
                ))}
              </div>
              <FieldError id="who-error" message={errors.asking_as?.message} />
            </fieldset>

            {/* Bệnh của người được chăm sóc — chỉ hỏi khi thực sự cần. */}
            {askingAs === 'caregiver' && (
              <fieldset className="mt-block">
                <legend className={FIELD_LABEL_CLASS}>
                  Người bạn chăm sóc được chẩn đoán mắc bệnh gì?
                </legend>
                <FieldHint id="cared-hint">
                  Trợ lý chỉ tra cứu trong tài liệu của Bộ Y tế về đúng bệnh này.
                </FieldHint>

                <div
                  className="mt-snug space-y-snug"
                  aria-describedby={
                    errors.primary_condition ? 'cared-hint cared-error' : 'cared-hint'
                  }
                >
                  {CONDITIONS.map((condition) => (
                    <ChoiceOption
                      key={condition}
                      type="radio"
                      name="primary_condition"
                      value={condition}
                      label={CONDITION_LABEL[condition]}
                      checked={primaryCondition === condition}
                      onChange={() =>
                        setValue('primary_condition', condition, {
                          shouldValidate: true,
                        })
                      }
                    />
                  ))}
                </div>
                <FieldError
                  id="cared-error"
                  message={errors.primary_condition?.message}
                />
              </fieldset>
            )}
          </>
        )}

        {/* ---- Bước 3: bệnh nền đi kèm, và thời điểm chẩn đoán ----
            Hai câu khó nhất để cuối: bệnh nền đòi người dùng nhớ chẩn đoán khác
            của mình, còn mốc thời gian thì nhiều người không nhớ chính xác. Cả
            hai đều bỏ trống được. */}
        {step === 2 && (
          <>
            <fieldset>
              <legend className={FIELD_LABEL_CLASS}>{labels.comorbidities}</legend>
              <FieldHint id="comorbid-hint">{labels.comorbiditiesHint}</FieldHint>

              {otherConditions.length === 0 ? (
                <p className="font-display mt-snug text-question text-moss">
                  Không còn bệnh nào khác trong phạm vi của trợ lý. Bạn bỏ qua mục
                  này.
                </p>
              ) : (
                <div
                  className="mt-snug space-y-snug"
                  aria-describedby={
                    errors.comorbidities ? 'comorbid-hint comorbid-error' : 'comorbid-hint'
                  }
                >
                  {otherConditions.map((condition) => (
                    <ChoiceOption
                      key={condition}
                      type="checkbox"
                      name="comorbidities"
                      value={condition}
                      label={CONDITION_LABEL[condition]}
                      checked={comorbidities.includes(condition)}
                      onChange={(isChecked) =>
                        setValue(
                          'comorbidities',
                          isChecked
                            ? [...comorbidities, condition]
                            : comorbidities.filter((item) => item !== condition),
                          { shouldValidate: true },
                        )
                      }
                    />
                  ))}
                </div>
              )}
              <FieldError id="comorbid-error" message={errors.comorbidities?.message} />
            </fieldset>

            <div className="mt-block">
              <label htmlFor="diagnosed_at" className={FIELD_LABEL_CLASS}>
                {labels.diagnosed}
              </label>
              <FieldHint id="diagnosed-hint">{labels.diagnosedHint}</FieldHint>
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
            1 không có nút lui vì không có chỗ nào để lui về. */}
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

          {step < LAST_STEP ? (
            <button
              type="button"
              onClick={() => void goNext()}
              className="font-display min-h-touch flex-1 rounded-lg border-2 border-medical bg-medical px-cozy text-input font-bold text-paper"
            >
              Tiếp tục
            </button>
          ) : (
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
