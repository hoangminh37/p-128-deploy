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
import { RootLayout } from './ui/RootLayout'
import { ChatScreen } from './screens/ChatScreen'
import { EditorDashboardScreen } from './screens/EditorDashboardScreen'
import { EditorItemScreen } from './screens/EditorItemScreen'
import { EditorQueueScreen } from './screens/EditorQueueScreen'
import { EditorUploadScreen } from './screens/EditorUploadScreen'
import { LoginScreen } from './screens/LoginScreen'
import { OutOfScopeScreen } from './screens/OutOfScopeScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { LearningLibraryScreen } from './screens/LearningLibraryScreen'

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

function App() {
  // Tạo trong state để StrictMode gọi render hai lần vẫn dùng chung một client,
  // nếu không cache sẽ bị vứt đi ngay sau lần render đầu.
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <PatientProvider>
          <BrowserRouter>
            {/* Không render gì, chỉ nối 401 của lớp api với việc xoá phiên, dọn
                cache và đưa về màn đăng nhập. Phải nằm trong `BrowserRouter`. */}
            <ExpiredSessionWatcher />

            <Routes>
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
                {/* Đường dẫn gốc không còn màn nào của riêng nó — chỉ rẽ đường. */}
                <Route index element={<LandingRedirect />} />

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
                  path="learning"
                  element={
                    <RequireRole role="patient">
                      <LearningLibraryScreen />
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

                {/* Đường dẫn lạ thì đưa về gốc, để guard ở gốc tự quyết đi đâu. */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </PatientProvider>
      </SessionProvider>
    </QueryClientProvider>
  )
}

export default App
