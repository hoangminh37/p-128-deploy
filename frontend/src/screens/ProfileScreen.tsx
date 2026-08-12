/**
 * Màn khai hồ sơ.
 *
 * Bốn trường của mục 3 hợp đồng API, hỏi bằng lời thường. Người dùng 45–70 tuổi
 * ít quen thuật ngữ y khoa, nên mỗi trường vừa hỏi vừa nói luôn vì sao cần biết —
 * người đang lo lắng mà bị hỏi dồn không giải thích thì sẽ bỏ giữa chừng.
 *
 * Chọn bệnh dùng nút lớn chứ không dùng danh sách thả xuống: thả xuống trên
 * điện thoại là một hộp cuộn nhỏ, ngón tay run bấm rất dễ trượt, và người dùng
 * không nhìn thấy hết lựa chọn cùng lúc.
 */
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
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

// ---------------------------------------------------------------------------
// Schema của form
// ---------------------------------------------------------------------------

const MIN_AGE = 18
const MAX_AGE = 120

/**
 * Schema form dựng từ schema hợp đồng, bỏ `patient_id` (do ứng dụng tự sinh)
 * và thay thông báo lỗi bằng tiếng Việt nói rõ phải sửa gì.
 *
 * Có một ràng buộc thêm mà hợp đồng không có: bệnh nền không được trùng bệnh
 * chính. Backend chấp nhận, nhưng với người bệnh thì "bệnh chính: tăng huyết áp,
 * bệnh kèm: tăng huyết áp" là vô nghĩa.
 */
const profileFormSchema = patientProfileSchema
  .omit({ patient_id: true })
  .extend({
    age: z
      .number({ error: 'Bạn hãy điền tuổi của mình bằng số, ví dụ 58.' })
      .int({ error: 'Tuổi phải là số nguyên, ví dụ 58 chứ không phải 58,5.' })
      .min(MIN_AGE, {
        error: `Ứng dụng này dành cho người từ ${MIN_AGE} tuổi trở lên. Bạn hãy kiểm tra lại tuổi vừa điền.`,
      })
      .max(MAX_AGE, {
        error: `Tuổi phải nằm trong khoảng ${MIN_AGE} đến ${MAX_AGE}. Bạn hãy kiểm tra lại số vừa điền.`,
      }),
    primary_condition: z.enum(CONDITIONS, {
      error: 'Bạn hãy chọn một trong hai bệnh mà bác sĩ đã chẩn đoán cho bạn.',
    }),
    comorbidities: z.array(primaryConditionSchema),
    diagnosed_at: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
        error: 'Bạn hãy chọn tháng và năm, ví dụ tháng 3 năm 2026.',
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
  const samples = [
    { age: MIN_AGE - 1, valid: false },
    { age: MIN_AGE, valid: true },
    { age: MAX_AGE, valid: true },
    { age: MAX_AGE + 1, valid: false },
    { age: 58.5, valid: false },
  ]

  for (const { age, valid } of samples) {
    const contractOk = patientProfileSchema.safeParse({
      patient_id: 'x',
      age,
      primary_condition: 'hypertension',
      comorbidities: [],
      diagnosed_at: null,
    }).success

    if (contractOk !== valid) {
      throw new Error(
        `ProfileScreen: ràng buộc tuổi ${age} trong schemas.ts đã đổi ` +
          `(hợp đồng nói ${contractOk ? 'hợp lệ' : 'không hợp lệ'}, form đang giả định ${valid ? 'hợp lệ' : 'không hợp lệ'}). ` +
          'Hãy cập nhật MIN_AGE/MAX_AGE và thông báo lỗi trong ProfileScreen.tsx.',
      )
    }
  }
}

assertMatchesContract()

// ---------------------------------------------------------------------------
// Ô chọn dạng nút lớn
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
  onBlur,
}: {
  type: 'radio' | 'checkbox'
  name: string
  value: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  onBlur?: () => void
}) {
  return (
    <label className="block cursor-pointer">
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        onBlur={onBlur}
        className="peer sr-only"
      />
      <span
        className="
          font-display flex min-h-touch items-center rounded-lg border-2 border-border p-snug text-question text-ink
          peer-checked:border-medical peer-checked:bg-medical peer-checked:font-semibold peer-checked:text-paper
          peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-medical
        "
      >
        {label}
      </span>
    </label>
  )
}

/** Dòng giải thích ngắn dưới nhãn: vì sao ứng dụng cần thông tin này. */
function FieldHint({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="font-display mt-hair text-note text-moss">
      {children}
    </p>
  )
}

/** Lỗi hiện ngay dưới trường của nó, không gom về cuối form. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (message === undefined) return null
  return (
    <p id={id} role="alert" className="font-display mt-tight text-note text-alert">
      {message}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Màn hình
// ---------------------------------------------------------------------------

export function ProfileScreen() {
  const { profile, profileState, ensurePatientId } = usePatient()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const isEditing = profile !== null

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      age: undefined,
      primary_condition: undefined,
      comorbidities: [],
      diagnosed_at: null,
    },
  })

  const primaryCondition = watch('primary_condition')
  const comorbidities = watch('comorbidities') ?? []

  // Hồ sơ tới sau lần render đầu (đang gọi API), nên phải nạp lại vào form khi có.
  useEffect(() => {
    if (profile === null) return
    reset({
      age: profile.age,
      primary_condition: profile.primary_condition,
      comorbidities: profile.comorbidities ?? [],
      diagnosed_at: profile.diagnosed_at ?? null,
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
      // Sinh patient_id đúng lúc này chứ không sớm hơn: đây là thời điểm người
      // dùng thực sự bắt đầu, và cũng là điều kiện để guard của `/chat` mở ra.
      const patientId = ensurePatientId()

      return upsertPatientProfile({
        patient_id: patientId,
        age: values.age,
        primary_condition: values.primary_condition,
        comorbidities: values.comorbidities,
        diagnosed_at: values.diagnosed_at,
      })
    },
    onSuccess: (saved) => {
      // Nạp thẳng kết quả vừa lưu vào cache, khỏi chờ một vòng GET nữa — thanh
      // trên cùng và màn chat thấy hồ sơ mới ngay khi chuyển màn.
      queryClient.setQueryData(patientProfileQueryKey(saved.patient_id), saved)
      void navigate('/chat', { replace: true })
    },
  })

  const onSubmit = handleSubmit((values) => mutation.mutate(values))

  // Đang đọc hồ sơ cũ thì chưa dựng form, tránh cảnh ô trống rồi nhảy số.
  if (profileState === 'loading') {
    return (
      <p role="status" className="font-display max-w-answer text-question text-moss">
        Đang mở hồ sơ của bạn…
      </p>
    )
  }

  const otherConditions = CONDITIONS.filter(
    (condition) => condition !== primaryCondition,
  )

  return (
    <div className="max-w-answer">
      <h1 className="font-display text-heading font-bold">
        {isEditing ? 'Sửa hồ sơ sức khỏe' : 'Khai hồ sơ sức khỏe'}
      </h1>

      {/* Ràng buộc PII của brief, nói ngay đầu form chứ không giấu ở chân trang:
          người sắp phải điền thông tin sức khỏe cần được trấn an TRƯỚC khi điền. */}
      <div className="mt-cozy border-l-4 border-medical pl-cozy">
        <p className="font-display text-question font-semibold">
          Bạn không cần khai tên hay giấy tờ
        </p>
        <p className="font-display mt-hair text-note text-moss">
          Ứng dụng không hỏi và không lưu tên, số điện thoại, số căn cước hay số
          thẻ bảo hiểm của bạn. Chỉ bốn thông tin dưới đây được lưu, và chỉ để
          trợ lý tra đúng tài liệu cho bệnh của bạn.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-block">
        {/* ---- Tuổi ---- */}
        <div className="mb-block">
          <label htmlFor="age" className="font-display block text-question font-semibold">
            Bạn bao nhiêu tuổi?
          </label>
          <FieldHint id="age-hint">
            Tuổi giúp trợ lý đưa lời khuyên hợp với lứa tuổi của bạn.
          </FieldHint>
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
            className="font-body mt-tight min-h-touch w-full rounded-lg border-2 border-border bg-paper p-snug text-input text-ink"
          />
          <FieldError id="age-error" message={errors.age?.message} />
        </div>

        {/* ---- Bệnh chính ---- */}
        <fieldset className="mb-block">
          <legend className="font-display text-question font-semibold">
            Bác sĩ chẩn đoán bạn mắc bệnh gì?
          </legend>
          <FieldHint id="primary-hint">
            Trợ lý chỉ tra cứu trong tài liệu của Bộ Y tế về đúng bệnh này.
          </FieldHint>
          <div
            className="mt-tight space-y-snug"
            aria-describedby={
              errors.primary_condition ? 'primary-hint primary-error' : 'primary-hint'
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
                  setValue('primary_condition', condition, { shouldValidate: true })
                }
              />
            ))}
          </div>
          <FieldError id="primary-error" message={errors.primary_condition?.message} />
        </fieldset>

        {/* ---- Bệnh nền đi kèm ---- */}
        <fieldset className="mb-block">
          <legend className="font-display text-question font-semibold">
            Bạn có mắc thêm bệnh nào dưới đây không?
          </legend>
          <FieldHint id="comorbid-hint">
            Nếu có, trợ lý sẽ lưu ý những điều cần tránh khi mắc cùng lúc hai
            bệnh. Nếu không có thì bạn cứ bỏ trống mục này.
          </FieldHint>

          {otherConditions.length === 0 ? (
            <p className="font-display mt-tight text-note text-moss">
              Bạn hãy chọn bệnh chính ở trên trước.
            </p>
          ) : (
            <div
              className="mt-tight space-y-snug"
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

        {/* ---- Thời điểm chẩn đoán ---- */}
        <div className="mb-block">
          <label
            htmlFor="diagnosed_at"
            className="font-display block text-question font-semibold"
          >
            Bạn được chẩn đoán từ khi nào?
          </label>
          <FieldHint id="diagnosed-hint">
            Không bắt buộc. Biết bạn mắc bệnh bao lâu rồi giúp lời khuyên sát
            hơn. Không nhớ chính xác thì bạn cứ bỏ trống.
          </FieldHint>
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
            className="font-body mt-tight min-h-touch w-full rounded-lg border-2 border-border bg-paper p-snug text-input text-ink"
          />
          <FieldError id="diagnosed-error" message={errors.diagnosed_at?.message} />
        </div>

        {/* ---- Lỗi khi lưu ---- */}
        {mutation.isError && (
          <div className="mb-block">
            <ErrorNotice
              error={mutation.error}
              retryLabel="Lưu lại"
              onRetry={() => void onSubmit()}
            />
          </div>
        )}

        {/* ---- Gửi ---- */}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="font-display min-h-touch w-full rounded-lg border-2 border-medical bg-medical px-cozy text-input font-bold text-paper disabled:border-rule disabled:bg-transparent disabled:font-normal disabled:text-moss"
        >
          {mutation.isPending
            ? 'Đang lưu…'
            : isEditing
              ? 'Lưu thay đổi'
              : 'Lưu và bắt đầu hỏi'}
        </button>

        {mutation.isPending && (
          <p role="status" className="font-display mt-tight text-note text-moss">
            Đang lưu hồ sơ của bạn…
          </p>
        )}
      </form>
    </div>
  )
}
