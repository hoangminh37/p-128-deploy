import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { uploadDocument, ApiError } from '../lib/api'

export function EditorUploadScreen() {
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    
    const form = e.currentTarget
    const formData = new FormData(form)
    
    // Đảm bảo diseases (bệnh) không rỗng
    const diseases = formData.get('diseases')
    if (!diseases) {
      setError("Vui lòng nhập ít nhất một loại bệnh (ví dụ: hypertension, type2_diabetes)")
      setIsSubmitting(false)
      return
    }

    try {
      await uploadDocument(formData)
      // Chuyển hướng về trang queue sau khi upload thành công
      navigate('/editor/queue')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.userMessage)
      } else {
        setError('Đã xảy ra lỗi không xác định.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Tải lên Tài liệu Y khoa</h1>
        <button
          onClick={() => navigate('/editor/dashboard')}
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          &larr; Quay lại
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label htmlFor="file" className="block text-sm font-medium text-slate-700">Tài liệu PDF <span className="text-red-500">*</span></label>
          <input
            type="file"
            id="file"
            name="file"
            accept="application/pdf"
            required
            className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:rounded-full file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

        <div>
          <label htmlFor="title" className="block text-sm font-medium text-slate-700">Tiêu đề <span className="text-red-500">*</span></label>
          <input type="text" id="title" name="title" required className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" placeholder="VD: Hướng dẫn chẩn đoán và điều trị tăng huyết áp" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="issuer" className="block text-sm font-medium text-slate-700">Nơi ban hành <span className="text-red-500">*</span></label>
            <input type="text" id="issuer" name="issuer" required className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" placeholder="VD: Bộ Y Tế" />
          </div>
          <div>
            <label htmlFor="published" className="block text-sm font-medium text-slate-700">Năm/Ngày ban hành <span className="text-red-500">*</span></label>
            <input type="text" id="published" name="published" required className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" placeholder="VD: 2024" />
          </div>
        </div>

        <div>
          <label htmlFor="diseases" className="block text-sm font-medium text-slate-700">Chỉ định bệnh (cách nhau dấu phẩy) <span className="text-red-500">*</span></label>
          <input type="text" id="diseases" name="diseases" required className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" placeholder="VD: hypertension, type2_diabetes" />
        </div>

        <div>
          <label htmlFor="doc_code" className="block text-sm font-medium text-slate-700">Mã tài liệu (tuỳ chọn)</label>
          <input type="text" id="doc_code" name="doc_code" className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" placeholder="VD: 3192/QĐ-BYT" />
        </div>

        <div>
          <label htmlFor="url" className="block text-sm font-medium text-slate-700">Đường dẫn gốc (tuỳ chọn)</label>
          <input type="url" id="url" name="url" className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" placeholder="https://" />
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-slate-700">Ghi chú (tuỳ chọn)</label>
          <textarea id="notes" name="notes" rows={3} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" placeholder="Ghi chú thêm cho người duyệt..." />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={() => navigate('/editor/dashboard')}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-blue-400"
          >
            {isSubmitting ? 'Đang tải lên...' : 'Tải lên tài liệu'}
          </button>
        </div>
      </form>
    </div>
  )
}
