/* ========================================
   Date Utilities
   ======================================== */

/**
 * Format date string to readable format
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string} formatted date
 */
export function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
}

/**
 * Format date to full format
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string} YYYY年MM月DD日
 */
export function formatDateFull(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}年${month}月${day}日`;
}

/**
 * Get weekday name in Chinese
 * @param {string} dateStr - YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS
 * @returns {string} Monday, Tuesday...
 */
export function getWeekday(dateStr) {
  const date = new Date(dateStr);
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return weekdays[date.getDay()];
}

/**
 * Get last N days as array of date strings
 * @param {number} n - number of days
 * @returns {string[]} array of YYYY-MM-DD strings
 */
export function getLastNDays(n) {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    dates.push(dateStr);
  }
  return dates;
}

/**
 * Check if two dates are the same day
 * @param {string|Date} date1
 * @param {string|Date} date2
 * @returns {boolean}
 */
export function isSameDay(date1, date2) {
  const d1 = typeof date1 === 'string' ? date1.split('T')[0] : date1.toISOString().split('T')[0];
  const d2 = typeof date2 === 'string' ? date2.split('T')[0] : date2.toISOString().split('T')[0];
  return d1 === d2;
}

/**
 * Get week number (ISO)
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string} YYYY-WXX
 */
export function getWeekNumber(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Get relative time description
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string} e.g. "今天", "昨天", "3天前"
 */
export function getRelativeTime(dateStr) {
  const today = new Date().toISOString().split('T')[0];
  if (dateStr === today) return '今天';
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === yesterday.toISOString().split('T')[0]) return '昨天';
  
  const diff = Math.floor((new Date(today) - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  if (diff < 7) return `${diff}天前`;
  if (diff < 14) return '上周';
  if (diff < 30) return '近一个月';
  return formatDateFull(dateStr);
}
