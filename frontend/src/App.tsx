/**
 * Gốc ứng dụng: provider, router, và các route của Gate 2.
 *
 * THỨ TỰ PROVIDER có ý nghĩa và không đảo được:
 *
 *   QueryClientProvider  — `PatientProvider` gọi `useQuery`.
 *   SessionProvider      — giữ token, và `PatientProvider` đọc `patient_id` từ đây.
 *   PatientProvider      — đọc hồ sơ của tài khoản đang đăng nhập.
 *
 * BỐ CỤC ROUTE: `/login` đứng ngoài khung ứng dụng, mọi đường dẫn còn lại nằm
 * trong một route layout đã bọc `RequireAuth`. Nhờ vậy "chưa đăng nhập thì về
 * `/login`" là một luật duy nhất đặt ở một chỗ duy nhất, kể cả với đường dẫn lạ
 * rơi vào nhánh `*`.
 */
import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom'

import { createQueryClient } from './app/queryClient'
import {
  LandingRedirect,
  RedirectIfAuthenticated,
  RequireAuth,
  RequireRole,
} from './app/guards'
import { PatientProvider } from './patient/PatientProvider'
import { ExpiredSessionWatcher } from './session/ExpiredSessionWatcher'
import { SessionProvider } from './session/SessionProvider'
import { useSession } from './session/context'
import { RootLayout } from './ui/RootLayout'
import { ThemeProvider } from './ui/ThemeProvider'
import { LandingScreen } from './screens/LandingScreen'
import { ChatScreen } from './screens/ChatScreen'
import { EditorDashboardScreen } from './screens/EditorDashboardScreen'
import { EditorConditionsScreen } from './screens/EditorConditionsScreen'
import { EditorDocumentViewerScreen } from './screens/EditorDocumentViewerScreen'
import { EditorDocumentsScreen } from './screens/EditorDocumentsScreen'
import { EditorItemScreen } from './screens/EditorItemScreen'
import { EditorQueueScreen } from './screens/EditorQueueScreen'
import { EditorUploadScreen } from './screens/EditorUploadScreen'
import { LoginScreen } from './screens/LoginScreen'
import { OutOfScopeScreen } from './screens/OutOfScopeScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { SourceDocumentScreen } from './screens/SourceDocumentScreen'
import { LearningLibraryScreen } from './screens/LearningLibraryScreen'
import { ArticleDetailScreen } from './screens/ArticleDetailScreen'
import { QuizScreen } from './screens/QuizScreen'
import { MistakesScreen } from './screens/MistakesScreen'
import { ConsultationsScreen } from './screens/ConsultationsScreen'
import { ConsultationRoomScreen } from './screens/ConsultationRoomScreen'
import { DoctorConsultationsScreen } from './screens/DoctorConsultationsScreen'
import { DoctorDashboardScreen } from './screens/DoctorDashboardScreen'
import { DoctorNotificationsScreen } from './screens/DoctorNotificationsScreen'
import { DoctorProfileScreen } from './screens/DoctorProfileScreen'
import { DoctorPublicProfileScreen } from './screens/DoctorPublicProfileScreen'
import { EditorDoctorsScreen } from './screens/EditorDoctorsScreen'
import { EditorPatientQuestionsScreen } from './screens/EditorPatientQuestionsScreen'

/**
 * Hai đường dẫn cùng dẫn tới màn hỏi đáp:
 *
 *   /chat                  — mở một phiên mới.
 *   /chat/:conversationId  — mở lại một phiên đã lưu, chọn từ thanh bên.
 *
 * `key` quyết định khi nào màn được dựng lại từ đầu. Không có nó thì câu hỏi
 * đang gõ dở và các lượt của phiên cũ sẽ dính sang phiên mới.
 *
 * VÌ SAO `/chat` KHÓA THEO `location.key` CHỨ KHÔNG PHẢI MỘT CHUỖI CỐ ĐỊNH:
 *
 * Bản trước dùng `key={opened ?? 'new'}`. Đứng sẵn ở `/chat` rồi bấm "Câu hỏi
 * mới" thì đường dẫn không đổi, `key` vẫn là `'new'`, nên React KHÔNG dựng lại
 * màn — toàn bộ state ở lại: các lượt cũ vẫn hiện, và tệ hơn, `conversationId`
 * vẫn trỏ vào phiên cũ nên câu hỏi tiếp theo nối vào phiên đó thay vì mở phiên
 * mới. Với người dùng thì nút trông như hỏng.
 *
 * `location.key` là chuỗi ngẫu nhiên React Router sinh mới cho MỖI lần điều
 * hướng, kể cả khi đường dẫn không đổi (lúc đó `Link` tự chuyển sang `replace`,
 * mà `replace` cũng gọi `createKey()` y như `push`). Nên mỗi lần bấm là một màn
 * sạch: state dọn hết, `conversationId` về `null`, người dùng thấy đổi ngay.
 *
 * Phiên đã lưu vẫn khóa theo `conversationId`: mở lại đúng phiên đang xem thì
 * không cần dựng lại, và như thế mới giữ được lịch sử đã tải trong cache.
 */
function ChatRoute() {
  const { conversationId } = useParams()
  const location = useLocation()
  const opened = conversationId ?? null

  return <ChatScreen key={opened ?? location.key} openedConversationId={opened} />
}

/**
 * Một tài liệu có thể được trích nhiều chunk. Khóa theo cả chunk khiến lần bấm
 * vào nguồn [2], [3] remount màn đối chiếu thay vì giữ lại vị trí/highlight của
 * nguồn [1] khi chỉ query string thay đổi.
 */
function SourceDocumentRoute() {
  const { documentId } = useParams()
  const [searchParams] = useSearchParams()
  const chunkId = searchParams.get('chunk') ?? ''

  return <SourceDocumentScreen key={`${documentId ?? ''}:${chunkId}`} />
}

/** One authenticated route component shared by the patient and doctor paths. */
function ConsultationRoomRoute() {
  const { consultationId } = useParams()
  return <ConsultationRoomScreen consultationId={consultationId ?? ''} />
}

/**
 * Đường dẫn gốc, hai mặt.
 *
 * Chưa đăng nhập thì đây là TRANG GIỚI THIỆU — màn duy nhất trong ứng dụng
 * mà người chưa có tài khoản xem được. Trước bản này, `/` nằm hẳn trong
 * `RequireAuth` nên khách lạ bị ném thẳng sang `/login` mà không biết mình
 * vừa mở cái gì.
 *
 * Đã đăng nhập thì LOGIC RẼ ĐƯỜNG KHÔNG ĐỔI MỘT LY: vẫn đúng
 * `LandingRedirect` cũ, vẫn rẽ theo vai trò rồi theo hồ sơ. Chỉ khác chỗ nó
 * đứng — nay ở ngoài route layout, nên `RootLayout` không phải dựng cả thanh
 * bên chỉ để hiển thị một thẻ `Navigate`.
 */
function RootRoute() {
  const { isAuthenticated } = useSession()

  return isAuthenticated ? <LandingRedirect /> : <LandingScreen />
}

function App() {
  // Tạo trong state để StrictMode gọi render hai lần vẫn dùng chung một client,
  // nếu không cache sẽ bị vứt đi ngay sau lần render đầu.
  const [queryClient] = useState(createQueryClient)

  return (
    // `ThemeProvider` bọc ngoài cùng và KHÔNG phụ thuộc gì vào ba provider kia:
    // chế độ hiển thị là thiết lập của cái máy này, có mặt cả khi chưa đăng
    // nhập, và trang giới thiệu ngoài `RequireAuth` cũng cần nó.
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <PatientProvider>
            <BrowserRouter>
              {/* Không render gì, chỉ nối 401 của lớp api với việc xoá phiên, dọn
                  cache và đưa về màn đăng nhập. Phải nằm trong `BrowserRouter`. */}
              <ExpiredSessionWatcher />

              <Routes>
                {/* Đứng NGOÀI `RequireAuth`: đây là màn duy nhất người chưa
                    đăng nhập được xem. Xem `RootRoute`. */}
                <Route path="/" element={<RootRoute />} />

                <Route
                  path="/login"
                  element={
                    <RedirectIfAuthenticated>
                      <LoginScreen />
                    </RedirectIfAuthenticated>
                  }
                />

                <Route
                  element={
                    <RequireAuth>
                      <RootLayout />
                    </RequireAuth>
                  }
                >
                  <Route
                    path="profile"
                    element={
                      <RequireRole role="patient">
                        <ProfileScreen />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="chat"
                    element={
                      <RequireRole role="patient">
                        <ChatRoute />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="chat/:conversationId"
                    element={
                      <RequireRole role="patient">
                        <ChatRoute />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="consultations"
                    element={
                      <RequireRole role="patient">
                        <ConsultationsScreen />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="consultations/:consultationId"
                    element={
                      <RequireRole role="patient">
                        <ConsultationRoomRoute />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="consultations/doctors/:doctorId"
                    element={
                      <RequireRole role="patient">
                        <DoctorPublicProfileScreen />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="sources/:documentId"
                    element={
                      <RequireRole role="patient">
                        <SourceDocumentRoute />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="learning"
                    element={
                      <RequireRole role="patient">
                        <LearningLibraryScreen />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="learning/:articleId"
                    element={
                      <RequireRole role="patient">
                        <ArticleDetailScreen />
                      </RequireRole>
                    }
                  />
                  {/* Chặng "Đánh giá" của vòng lặp giáo dục. Nguồn ra đề nằm ở
                      query string (`?source=article&ref=...`), xem QuizScreen. */}
                  <Route
                    path="quiz"
                    element={
                      <RequireRole role="patient">
                        <QuizScreen />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="quiz/mistakes"
                    element={
                      <RequireRole role="patient">
                        <MistakesScreen />
                      </RequireRole>
                    }
                  />
                  {/* Bốn màn của khu vực biên tập, cùng một guard vai trò. */}
                  <Route
                    path="editor"
                    element={
                      <RequireRole role="editor">
                        <EditorDashboardScreen />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="editor/upload"
                    element={
                      <RequireRole role="editor">
                        <EditorUploadScreen />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="editor/conditions"
                    element={
                      <RequireRole role="editor">
                        <EditorConditionsScreen />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="editor/documents"
                    element={
                      <RequireRole role="editor">
                        <EditorDocumentsScreen />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="editor/documents/:documentId"
                    element={
                      <RequireRole role="editor">
                        <EditorDocumentViewerScreen />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="editor/queue"
                    element={
                      <RequireRole role="editor">
                        <EditorQueueScreen />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="editor/queue/:itemId"
                    element={
                      <RequireRole role="editor">
                        <EditorItemScreen />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="editor/out-of-scope"
                    element={
                      <RequireRole role="editor">
                        <OutOfScopeScreen />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="editor/doctors"
                    element={
                      <RequireRole role="editor">
                        <EditorDoctorsScreen />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="editor/patient-questions"
                    element={
                      <RequireRole role="editor">
                        <EditorPatientQuestionsScreen />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="doctor"
                    element={
                      <RequireRole role="doctor">
                        <DoctorDashboardScreen />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="doctor/notifications"
                    element={
                      <RequireRole role="doctor">
                        <DoctorNotificationsScreen />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="doctor/consultations"
                    element={
                      <RequireRole role="doctor">
                        <DoctorConsultationsScreen />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="doctor/profile"
                    element={
                      <RequireRole role="doctor">
                        <DoctorProfileScreen />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="doctor/consultations/:consultationId"
                    element={
                      <RequireRole role="doctor">
                        <ConsultationRoomRoute />
                      </RequireRole>
                    }
                  />

                  {/* Đường dẫn lạ thì đưa về gốc, để guard ở gốc tự quyết đi đâu. */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </PatientProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
