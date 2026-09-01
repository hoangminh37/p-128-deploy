/**
 * Màn khai hồ sơ — cũng là màn đầu tiên người dùng mới nhìn thấy.
 *
 * Không còn màn chọn vai trò đứng trước. Vai trò phải đến từ tài khoản, không
 * phải từ việc người dùng tự khai, nên bước đó đã bỏ hẳn (xem `app/guards.tsx`).
 *
 * BỐ CỤC, dựng theo `id="hs"` của bản mẫu — `.co` hai cột:
 *
 *   cột chính — form ba bước: tuổi và thể trạng, rồi bệnh đã được chẩn đoán,
 *               rồi thời điểm chẩn đoán. Xem `STEP_TITLES`.
 *   cột phụ   — `ProfileIntro`, ba giới hạn của công cụ, cộng bảng điểm học
 *               tập với người quay lại sửa hồ sơ.
 *
 * Ba điều cần nói trước đây nằm CHẮN NGANG đầu cột chính và đẩy ô nhập đầu tiên
 * xuống dưới màn hình đầu. Sang cột phụ thì trên màn rộng chúng đứng song song
 * với form; dưới 1162px `.co` tự về một cột và form vẫn lên trước.
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
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useForm, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { listAvailableConditions, upsertPatientProfile } from '../lib/api'
import {
  patientProfileSchema,
  primaryConditionSchema,
  type PatientProfileResponse,
} from '../lib/schemas'
import { patientProfileQueryKey, usePatient } from '../patient/context'
import { useDailyLesson } from '../app/learning'
import { ErrorNotice } from '../ui/ErrorNotice'
import { ProfileIntro } from '../ui/ProfileIntro'
import { StepProgress } from '../ui/StepProgress'

const DIAGNOSIS_MONTHS = [
  { value: '01', label: 'Tháng 1' },
  { value: '02', label: 'Tháng 2' },
  { value: '03', label: 'Tháng 3' },
  { value: '04', label: 'Tháng 4' },
  { value: '05', label: 'Tháng 5' },
  { value: '06', label: 'Tháng 6' },
  { value: '07', label: 'Tháng 7' },
  { value: '08', label: 'Tháng 8' },
  { value: '09', label: 'Tháng 9' },
  { value: '10', label: 'Tháng 10' },
  { value: '11', label: 'Tháng 11' },
  { value: '12', label: 'Tháng 12' },
] as const

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
  diagnosed: 'Bạn được chẩn đoán vào tháng/năm nào?',
  diagnosedHint:
    'Không bắt buộc. Hệ thống lưu theo tháng/năm; bạn có thể sửa lại bất cứ lúc nào. ' +
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
 *   2. Còn lại thì lấy bệnh đứng trước trong danh mục bệnh đang hoạt động.
 *      Đây là một thứ tự CỐ ĐỊNH
 *      chứ không phải xếp hạng y khoa: nếu lấy theo thứ tự người dùng bấm thì
 *      cùng một cặp bệnh lại ra hai payload khác nhau tuỳ ai bấm ô nào trước.
 *
 * Bệnh còn lại rơi vào `comorbidities`. Hai trường vì thế không bao giờ trùng
 * nhau — đúng ràng buộc mà form cũ phải tự canh bằng `.refine()`.
 */
function splitConditions(
  selected: readonly string[],
  previousPrimary: string | null,
  availableConditionIds: readonly string[],
): { primary: string; comorbidities: string[] } {
  const ordered = availableConditionIds.filter((condition) => selected.includes(condition))

  const primary =
    previousPrimary !== null && ordered.includes(previousPrimary)
      ? previousPrimary
      : ordered[0]

  // `conditions` được form kiểm tra phải có ít nhất một phần tử. Chốt này vẫn
  // cần thiết vì catalog có thể vừa đổi ở một tab khác: không được gửi một
  // payload không có bệnh chính chỉ vì dữ liệu UI đã cũ.
  if (primary === undefined) {
    throw new Error('Danh mục bệnh đã thay đổi. Hãy chọn lại bệnh trước khi lưu.')
  }

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
      .refine((value) => value <= new Date().toISOString().slice(0, 7), {
        error: 'Thời điểm chẩn đoán không thể ở tương lai.',
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
 * Một bệnh trong danh mục, dựng đúng `.chon` của `id="hs"`.
 *
 * ĐỔI TỪ CHECKBOX ẨN SANG NÚT `aria-pressed`. Bản trước giấu một `input` thật
 * dưới một `span` đã tạo dáng để mượn hành vi bàn phím gốc. Bản mẫu không dựng
 * như thế: nó dùng `button` với `aria-pressed`, và mọi dáng của `.chon` — viền
 * tím, nền `--tim-wash`, ô `.box` tô đặc — đều móc vào đúng thuộc tính đó
 * (`.chon[aria-pressed="true"]`). Giữ checkbox ẩn thì thuộc tính kia không bao
 * giờ được đặt và cả ô đứng im một dáng.
 *
 * Không mất gì về bàn phím hay trình đọc màn hình: `button` vẫn nhận tiêu điểm
 * theo thứ tự tài liệu, vẫn bật tắt bằng phím cách và Enter, và `aria-pressed`
 * được đọc thành "đã chọn / chưa chọn" đúng như checkbox. Cái mất là hành vi đi
 * bằng phím mũi tên của một NHÓM RADIO — nhưng đây chưa bao giờ là nhóm radio:
 * người mắc cả hai bệnh chọn được cả hai ô.
 *
 * Viền focus lấy thẳng từ `.btn:focus-visible` của bản mẫu, không phải một quy
 * tắc riêng: `.chon` là một nút, và mọi nút trong hệ này viền tím dày 3px.
 *
 * Ô `.box` để TRỐNG khi chưa chọn, tô đặc `--tim` khi đã chọn — hai trạng thái
 * khác hẳn nhau nhìn lướt cũng thấy. Không vẽ dấu tick mờ sẵn trong ô chưa
 * chọn: đó là tín hiệu ngược hẳn với nghĩa của nó.
 */
function ConditionChoice({
  label,
  sublabel,
  checked,
  onChange,
}: {
  label: string
  /** Tên khác của bệnh, nếu danh mục có. Bỏ trống thì không dựng dòng thứ hai. */
  sublabel: string | null
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      className="chon"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      style={{ width: '100%' }}
    >
      <span className="box" aria-hidden="true" />
      <span>
        <span style={{ display: 'block', fontWeight: 500, fontSize: 'var(--t-lead)' }}>
          {label}
        </span>
        {sublabel !== null && (
          <span style={{ display: 'block', fontSize: 'var(--t-note)', color: 'var(--xam)' }}>
            {sublabel}
          </span>
        )}
      </span>
    </button>
  )
}

/**
 * Dòng giải thích ngắn dưới nhãn: vì sao ứng dụng cần thông tin này.
 *
 * Cỡ `--t-note` chứ không phải cỡ chữ thân bài: nhãn `.lab` ngay trên mới là
 * câu hỏi, dòng này là chú thích cho nhãn đó.
 */
function FieldHint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p
      id={id}
      style={{ fontSize: 'var(--t-note)', color: 'var(--xam)', marginTop: 6, lineHeight: 1.6 }}
    >
      {children}
    </p>
  )
}

/** Lỗi hiện ngay dưới trường của nó, không gom về cuối form. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (message === undefined) return null
  return (
    <p
      id={id}
      role="alert"
      style={{ marginTop: 8, color: 'var(--do)', fontSize: 'var(--t-note)', lineHeight: 1.6 }}
    >
      {message}
    </p>
  )
}

/** Khoảng cách từ nhãn `.lab` xuống ô `.o`, theo đúng nhịp của bản mẫu. */
const INPUT_STYLE = { marginTop: 7 } as const
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

function splitDiagnosisDate(value: string | null | undefined): { month: string; year: string } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value ?? '')
  return match ? { year: match[1], month: match[2] } : { year: '', month: '' }
}

// ---------------------------------------------------------------------------
// Màn hình
// ---------------------------------------------------------------------------

export function ProfileScreen() {
  const { patientId, profile, profileState, profileError, reloadProfile } = usePatient()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: lessonData } = useDailyLesson()
  const conditionCatalog = useQuery({
    queryKey: ['conditions', 'active'],
    queryFn: listAvailableConditions,
  })
  const availableConditions = conditionCatalog.data?.conditions
  const availableConditionIds = useMemo(
    () => availableConditions?.map((condition) => condition.condition_id) ?? [],
    [availableConditions],
  )

  const [step, setStep] = useState(0)
  const [diagnosisMonth, setDiagnosisMonth] = useState('')
  const [diagnosisYear, setDiagnosisYear] = useState('')

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
  const diagnosisIsComplete = /^\d{4}$/.test(diagnosisYear) && diagnosisMonth !== ''
  const diagnosisIsIncomplete =
    (diagnosisMonth !== '' || diagnosisYear !== '') && !diagnosisIsComplete
  const diagnosisError =
    errors.diagnosed_at?.message ??
    (diagnosisIsIncomplete ? 'Hãy chọn đủ tháng và nhập đủ 4 chữ số của năm.' : undefined)

  function updateDiagnosisDate(month: string, year: string): void {
    setDiagnosisMonth(month)
    setDiagnosisYear(year)

    // Chỉ đẩy giá trị hoàn chỉnh xuống form. Nếu người dùng đang xoá/gõ lại
    // năm, form giữ `null` và hiện lỗi cục bộ thay vì gửi một ngày nửa chừng.
    const nextValue = /^\d{4}$/.test(year) && month !== '' ? `${year}-${month}` : null
    setValue('diagnosed_at', nextValue, { shouldDirty: true, shouldValidate: true })
  }

  // Hồ sơ tới sau lần render đầu (đang gọi API), nên phải nạp lại vào form khi có.
  //
  // Đây là chiều ngược của `splitConditions`: hợp đồng giữ hai trường, form giữ
  // một danh sách, nên nạp lại là gộp chúng về một. Lọc qua danh mục đang hoạt
  // động để thứ
  // tự luôn cố định, và để một hồ sơ cũ lỡ có bệnh kèm trùng bệnh chính cũng
  // chỉ làm sáng lên một ô chứ không sinh mục trùng.
  useEffect(() => {
    if (profile === null) return
    const saved = [profile.primary_condition, ...(profile.comorbidities ?? [])]
    const diagnosisDate = splitDiagnosisDate(profile.diagnosed_at)
    reset({
      age: profile.age,
      conditions: availableConditionIds.filter((condition) => saved.includes(condition)),
      diagnosed_at: profile.diagnosed_at ?? null,
      height_cm: profile.height_cm ?? null,
      weight_kg: profile.weight_kg ?? null,
    })
    setDiagnosisMonth(diagnosisDate.month)
    setDiagnosisYear(diagnosisDate.year)
  }, [availableConditionIds, profile, reset])

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
        availableConditionIds,
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
    if (diagnosisIsIncomplete) {
      event.preventDefault()
      return
    }
    void submitProfile(event)
  }

  /**
   * Bật tắt một bệnh ở bước 2.
   *
   * Dựng lại danh sách theo thứ tự của danh mục đang hoạt động chứ không nối thêm vào
   * cuối: thứ tự trong form khi đó không phụ thuộc người dùng bấm ô nào trước,
   * nên `splitConditions` luôn cho cùng một kết quả với cùng một lựa chọn.
   */
  function toggleCondition(condition: string, isChecked: boolean): void {
    setValue(
      'conditions',
      availableConditionIds.filter((candidate) =>
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
      <p role="status" className="lab">
        Đang mở hồ sơ của bạn…
      </p>
    )
  }

  return (
    /* CHÉP TỪ `id="hs"`: nhãn chặng `.eb`, tiêu đề `--t-h1` bó trong 18ch, rồi
       `.co` hai cột — trái là form, phải là `.phu` dính trên đỉnh.

       Bản trước là một cột `max-w-answer` căn giữa. Cột phụ nay đã có nội dung
       thật (lời dặn, và với người quay lại sửa hồ sơ là cả bảng điểm), nên chỗ
       trống bên phải biến mất mà không phải căn giữa gì cả. Dưới 1162px `.co`
       tự về một cột và form lên trước, đúng thứ tự cần làm. */
    <div>
      <div className="eb">Hồ sơ sức khoẻ</div>
      <h1 style={{ fontSize: 'var(--t-h1)', lineHeight: 1.16, marginTop: 16, maxWidth: '18ch' }}>
        {isEditing ? 'Sửa hồ sơ sức khoẻ' : 'Trước khi bắt đầu'}
      </h1>

      <div className="co" style={{ marginTop: 30 }}>
        <div>
          {profileState === 'error' && (
            <div style={{ marginBottom: 22 }}>
              <ErrorNotice
                error={profileError}
                retryLabel="Đọc lại hồ sơ"
                onRetry={reloadProfile}
              />
            </div>
          )}

          <StepProgress
            current={step + 1}
            total={STEP_TITLES.length}
            title={STEP_TITLES[step]}
          />

          <form onSubmit={onFormSubmit} noValidate style={{ marginTop: 26 }}>
            {/* ---- Bước 1: tuổi, chiều cao, cân nặng ----
                Ba con số dễ trả lời nhất, hỏi trước để người dùng vào guồng. */}
            {step === 0 && (
              <>
                <div>
                  <label htmlFor="age" className="lab" style={{ display: 'block' }}>
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
                    className="o"
                    style={INPUT_STYLE}
                  />
                  <FieldError id="age-error" message={errors.age?.message} />
                </div>

                {/* ---- Chiều cao và cân nặng ----
                    Hỏi chung một nhóm vì chúng được dùng chung một việc: chọn
                    tài liệu hợp thể trạng. Cả hai bỏ trống được, và dòng nhắc
                    nói thẳng điều đó — người không nhớ số của mình không nên bị
                    kẹt ở đây.

                    Không tính và không hiện BMI, cũng không gợi ý cân nặng nên
                    có. Hợp đồng mục 4 xếp việc đó vào tư vấn dinh dưỡng cá nhân
                    hoá, nằm ngoài phạm vi giáo dục của sản phẩm.

                    `.auto` xếp hai ô cạnh nhau khi còn chỗ và tự xuống dòng khi
                    hết, không cần điểm ngắt nào. */}
                <fieldset style={{ border: 0, margin: '26px 0 0', padding: 0 }}>
                  <legend className="lab" style={{ padding: 0 }}>
                    {LABELS.body}
                  </legend>
                  <FieldHint id="body-hint">{LABELS.bodyHint}</FieldHint>

                  <div className="auto" style={{ marginTop: 14 }}>
                    <div>
                      <label htmlFor="height_cm" className="lab" style={{ display: 'block' }}>
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
                        className="o"
                        style={INPUT_STYLE}
                      />
                      <FieldError id="height-error" message={errors.height_cm?.message} />
                    </div>

                    <div>
                      <label htmlFor="weight_kg" className="lab" style={{ display: 'block' }}>
                        {LABELS.weight}
                      </label>
                      <input
                        id="weight_kg"
                        type="number"
                        inputMode="decimal"
                        min={MIN_WEIGHT_KG}
                        max={MAX_WEIGHT_KG}
                        // Một chữ số thập phân là KHUYẾN NGHỊ của hợp đồng chứ
                        // không phải ràng buộc: `step` chỉ đặt nhịp cho nút tăng
                        // giảm, form đã `noValidate` nên trình duyệt không chặn
                        // số lẻ hơn.
                        step={0.1}
                        aria-describedby={
                          errors.weight_kg ? 'body-hint weight-error' : 'body-hint'
                        }
                        aria-invalid={errors.weight_kg !== undefined}
                        {...register('weight_kg', { setValueAs: toOptionalNumber })}
                        className="o"
                        style={INPUT_STYLE}
                      />
                      <FieldError id="weight-error" message={errors.weight_kg?.message} />
                    </div>
                  </div>
                </fieldset>
              </>
            )}

            {/* ---- Bước 2: bệnh đã được chẩn đoán ----
                MỘT câu cho cả hai bệnh, chọn được nhiều ô. Người mắc đồng thời
                đái tháo đường và tăng huyết áp không tự xếp bệnh nào là chính,
                mà hỏi họ điều đó cũng không giúp gì cho câu trả lời — việc tách
                `primary_condition` với `comorbidities` là yêu cầu của hợp đồng
                API, và nó được xử lý ở `splitConditions` lúc gửi. */}
            {step === 1 && (
              <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
                <legend className="lab" style={{ padding: 0 }}>
                  {LABELS.conditions}
                </legend>
                <FieldHint id="conditions-hint">{LABELS.conditionsHint}</FieldHint>

                {conditionCatalog.isPending && (
                  <p role="status" className="lab" style={{ marginTop: 14 }}>
                    Đang đọc danh mục bệnh được hệ thống hỗ trợ…
                  </p>
                )}
                {conditionCatalog.isError && (
                  <div style={{ marginTop: 14 }}>
                    <ErrorNotice
                      error={conditionCatalog.error}
                      retryLabel="Đọc lại danh mục"
                      onRetry={() => void conditionCatalog.refetch()}
                    />
                  </div>
                )}

                {conditionCatalog.data !== undefined && (
                  <div
                    style={{ display: 'grid', gap: 10, marginTop: 14 }}
                    aria-describedby={
                      errors.conditions
                        ? 'conditions-hint conditions-error'
                        : 'conditions-hint'
                    }
                  >
                    {conditionCatalog.data.conditions.map((condition) => (
                      <ConditionChoice
                        key={condition.condition_id}
                        label={condition.label_vi}
                        // Dòng phụ là tên tiếng Anh của bệnh, đúng thứ danh mục
                        // có thật. Bản mẫu để chỗ này là các tên gọi khác trong
                        // tiếng Việt; ngày nào hợp đồng trả về chúng thì thay
                        // vào đây, chứ không bịa sẵn một danh sách.
                        sublabel={condition.label_en}
                        checked={conditions.includes(condition.condition_id)}
                        onChange={(isChecked) =>
                          toggleCondition(condition.condition_id, isChecked)
                        }
                      />
                    ))}
                  </div>
                )}
                <FieldError id="conditions-error" message={errors.conditions?.message} />
              </fieldset>
            )}

            {/* ---- Bước 3: thời điểm chẩn đoán ----
                Câu khó nhớ nhất để cuối, và nó bỏ trống được. */}
            {step === 2 && (
              <>
                <div>
                  <p className="lab">{LABELS.diagnosed}</p>
                  <FieldHint id="diagnosed-hint">{LABELS.diagnosedHint}</FieldHint>
                  {/* Giá trị chuẩn YYYY-MM vẫn là một field của React Hook Form;
                      hai control bên dưới chỉ là cách nhập dễ chỉnh hơn input
                      month mặc định của từng trình duyệt. */}
                  <input type="hidden" {...register('diagnosed_at')} />
                  <div className="auto" style={{ marginTop: 14 }}>
                    <div>
                      <label
                        htmlFor="diagnosed_month"
                        className="lab"
                        style={{ display: 'block' }}
                      >
                        Tháng
                      </label>
                      <select
                        id="diagnosed_month"
                        value={diagnosisMonth}
                        onChange={(event) =>
                          updateDiagnosisDate(event.target.value, diagnosisYear)
                        }
                        aria-describedby={
                          diagnosisError ? 'diagnosed-hint diagnosed-error' : 'diagnosed-hint'
                        }
                        aria-invalid={diagnosisError !== undefined}
                        className="o"
                        style={INPUT_STYLE}
                      >
                        <option value="">Chọn tháng</option>
                        {DIAGNOSIS_MONTHS.map((month) => (
                          <option key={month.value} value={month.value}>
                            {month.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="diagnosed_year"
                        className="lab"
                        style={{ display: 'block' }}
                      >
                        Năm
                      </label>
                      <input
                        id="diagnosed_year"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={4}
                        placeholder="Ví dụ 2025"
                        value={diagnosisYear}
                        onChange={(event) =>
                          updateDiagnosisDate(
                            diagnosisMonth,
                            event.target.value.replace(/\D/g, '').slice(0, 4),
                          )
                        }
                        aria-describedby={
                          diagnosisError ? 'diagnosed-hint diagnosed-error' : 'diagnosed-hint'
                        }
                        aria-invalid={diagnosisError !== undefined}
                        className="o"
                        style={INPUT_STYLE}
                      />
                    </div>
                  </div>
                  <FieldError id="diagnosed-error" message={diagnosisError} />
                </div>

                {mutation.isError && (
                  <div style={{ marginTop: 22 }}>
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
                Hàng nút của `id="hs"`: `.btn` thường cho "Quay lại", `.btn.pri`
                cho việc chính, `flex-wrap` để hai nút tự xuống dòng khi hẹp.
                Bước 1 không có nút lui vì không có chỗ nào để lui về.

                HAI NÚT CHÍNH LÀ HAI Ô CON RIÊNG BIỆT. ĐỪNG GỘP LẠI THÀNH MỘT
                BIỂU THỨC BA NGÔI. Đây là nguyên nhân của một lỗi thật, không
                phải sở thích trình bày:

                Viết `{cond ? <button type="button"/> : <button type="submit"/>}`
                thì hai nhánh nằm cùng MỘT ô con và cùng loại phần tử `button`,
                nên React không dựng nút mới mà dùng lại đúng node DOM cũ, chỉ vá
                thuộc tính — trong đó có `type`. Bấm "Tiếp tục" ở bước áp chót thì
                `goNext` chạy `await trigger(...)` rồi `setStep`, mà microtask lại
                chạy xong ngay khi listener trả về, tức TRƯỚC lúc trình duyệt thực
                thi activation behavior của nút vừa bấm. React kịp đổi `type` của
                chính node đó thành `submit`, trình duyệt thấy một nút submit và
                gửi form. Lúc ấy `step` đã bằng `LAST_STEP` nên chốt trong
                `onFormSubmit` cũng cho qua: hồ sơ bị lưu và người dùng bị đẩy
                sang `/chat` giữa chừng.

                Tách làm hai ô con thì mỗi nút có vị trí riêng: React THÁO hẳn nút
                "Tiếp tục" và GẮN một nút "Lưu" mới. Node vừa được bấm rời khỏi
                tài liệu nên không còn form owner, không submit được gì; còn nút
                submit là node mới toanh, chưa hề nhận cú bấm nào. */}
            <div style={{ display: 'flex', gap: 11, marginTop: 32, flexWrap: 'wrap' }}>
              {step > 0 && (
                <button type="button" onClick={goBack} className="btn">
                  Quay lại
                </button>
              )}

              {step < LAST_STEP && (
                <button type="button" onClick={() => void goNext()} className="btn pri">
                  Tiếp tục
                </button>
              )}

              {/* `type="submit"` giữ nguyên: ở bước cuối, Enter trong ô nhập phải
                  lưu được hồ sơ như mọi form khác. */}
              {step === LAST_STEP && (
                <button type="submit" disabled={mutation.isPending} className="btn pri">
                  {mutation.isPending
                    ? 'Đang lưu…'
                    : isEditing
                      ? 'Lưu thay đổi'
                      : 'Lưu và bắt đầu hỏi'}
                </button>
              )}
            </div>

            {mutation.isPending && (
              <p role="status" className="lab" style={{ marginTop: 12 }}>
                Đang lưu hồ sơ…
              </p>
            )}

            {/* ---- Đường thoát, chỉ ở bước 1 ---- */}
            {step === 0 && !isEditing && (
              <div style={{ marginTop: 32, borderTop: '1px solid var(--ke)', paddingTop: 18 }}>
                <button type="button" onClick={skipProfile} className="btn sm gh">
                  Bỏ qua, tôi muốn thử hỏi một câu trước
                </button>
                <p
                  style={{
                    marginTop: 10,
                    fontSize: 'var(--t-note)',
                    color: 'var(--xam)',
                    lineHeight: 1.66,
                    maxWidth: '56ch',
                  }}
                >
                  Bạn vẫn hỏi được ngay. Chỉ là câu trả lời chưa đặt được vào bệnh và
                  tuổi của bạn, nên sẽ chung chung hơn. Khai hồ sơ lúc nào cũng được.
                </p>
              </div>
            )}
          </form>
        </div>

        {/* Cột phụ của `id="hs"`. Bản mẫu để ở đây một thẻ "trợ lý sẽ dùng" liệt
            kê văn bản đang mở — màn này chưa có nguồn dữ liệu nào cho danh sách
            đó, nên không dựng một thẻ rỗng để giữ chỗ. Thay vào là hai thứ đã có
            thật: lời dặn, và với người quay lại sửa hồ sơ thì cả việc học. */}
        <div className="phu">
          <ProfileIntro />

          {isEditing && lessonData?.stats && (
            <div className="phieu" style={{ marginTop: 16 }}>
              <div className="phieu-top">
                <span>Việc học của bạn</span>
              </div>
              <div style={{ padding: '16px 18px' }}>
                {/* Hai con số mono cỡ lớn, đúng lối thẻ đếm ở cột phụ của bản
                    mẫu. Điểm dùng `--xanh` vì nó là thứ đã tích được; chuỗi ngày
                    dùng `--tim` để hai con số không đọc thành một cặp. */}
                <div
                  className="mono"
                  style={{ fontSize: 'clamp(30px,3vw,40px)', color: 'var(--xanh)', lineHeight: 1.1 }}
                >
                  {lessonData.stats.total_score}
                </div>
                <div className="lab">Điểm đã tích được</div>

                <div style={{ height: 1, background: 'var(--ke)', margin: '14px 0' }} />

                <div
                  className="mono"
                  style={{ fontSize: 'clamp(30px,3vw,40px)', color: 'var(--tim)', lineHeight: 1.1 }}
                >
                  {lessonData.stats.current_streak}
                </div>
                <div className="lab">Ngày học liền nhau</div>
              </div>
              <div className="rangcua" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
