/**
 * Gốc ứng dụng: provider, router, và ba route của luồng bệnh nhân.
 *
 * Thứ tự provider có ý nghĩa — `PatientProvider` gọi `useQuery` để đọc hồ sơ nên
 * bắt buộc phải nằm trong `QueryClientProvider`.
 */
import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { createQueryClient } from './app/queryClient'
import { RedirectIfPatientExists, RequirePatient } from './app/guards'
import { PatientProvider } from './patient/PatientProvider'
import { RootLayout } from './ui/RootLayout'
import { ChatScreen } from './screens/ChatScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { RoleScreen } from './screens/RoleScreen'

function App() {
  // Tạo trong state để StrictMode gọi render hai lần vẫn dùng chung một client,
  // nếu không cache sẽ bị vứt đi ngay sau lần render đầu.
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <PatientProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<RootLayout />}>
              <Route
                index
                element={
                  <RedirectIfPatientExists>
                    <RoleScreen />
                  </RedirectIfPatientExists>
                }
              />
              <Route path="profile" element={<ProfileScreen />} />
              <Route
                path="chat"
                element={
                  <RequirePatient>
                    <ChatScreen />
                  </RequirePatient>
                }
              />
              {/* Đường dẫn lạ thì đưa về gốc, để guard ở gốc tự quyết đi đâu. */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </PatientProvider>
    </QueryClientProvider>
  )
}

export default App
