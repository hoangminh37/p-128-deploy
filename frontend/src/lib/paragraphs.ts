/**
 * Cắt trường `answer` của API thành các đoạn văn.
 *
 * Backend gửi `answer` là một chuỗi thuần, đoạn cách nhau bằng một dòng trống.
 * Dựng thẳng chuỗi đó vào một thẻ `p` sẽ cho ra một khối chữ liền không có nhịp
 * nghỉ — thứ mà người 45–70 tuổi đọc vài dòng là lạc.
 *
 * Để ở đây vì hai nơi cần: `AnswerDocument` (câu trả lời có trích dẫn) và bốn
 * khối trạng thái ở `ResponseStates` (không bao giờ có trích dẫn, theo mục 5 và
 * mục 6 hợp đồng). Hai nơi cắt đoạn theo hai luật khác nhau thì cùng một câu
 * trả lời sẽ xuống dòng khác nhau tùy trạng thái.
 */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block !== '')
}
