// Template interface copy only. Never translate tenant-authored content or source record labels.
// Plain JS so the host and kit use the exact same implementation, without network or tenant state.
const arabic = Object.freeze({
  'Explore': 'تصفّح', 'Menu': 'القائمة', 'Open menu': 'فتح القائمة', 'Close menu': 'إغلاق القائمة',
  'Skip to content': 'انتقل إلى المحتوى', 'Skip to main content': 'انتقل إلى المحتوى الرئيسي',
  'Search the website': 'ابحث في الموقع', 'Search this site': 'ابحث في الموقع',
  'Main': 'التنقل الرئيسي', 'Footer': 'تذييل الصفحة', 'Social links': 'حسابات التواصل',
  'Cookies': 'ملفات تعريف الارتباط', 'Cookie settings': 'إعدادات ملفات تعريف الارتباط',
  'Previous image': 'الصورة السابقة', 'Next image': 'الصورة التالية',
  'Previous campaign': 'الحملة السابقة', 'Next campaign': 'الحملة التالية',
  'At the mosque': 'في المسجد', 'Prayer times': 'مواقيت الصلاة',
  'Prayer and Jumuah times': 'مواقيت الصلاة والجمعة', 'Prayer schedule': 'مواقيت الصلاة',
  'Prayer timetable': 'جدول الصلاة', 'Daily prayer timetable': 'جدول الصلوات اليومية',
  'Daily prayer times': 'مواقيت الصلوات اليومية', 'Daily prayers': 'الصلوات اليومية',
  'Prayer': 'الصلاة', 'Jumuah': 'الجمعة', 'Friday prayer': 'صلاة الجمعة',
  'Friday at the mosque': 'الجمعة في المسجد', 'Prayer information': 'معلومات الصلاة',
  'Full timetable': 'الجدول الكامل', 'Next:': 'الصلاة القادمة:',
  'Begins': 'بداية الوقت', 'Congregation': 'الجماعة', 'Jama’at': 'الجماعة',
  'Read article': 'اقرأ الخبر', 'Read more': 'اقرأ المزيد', 'Find out more': 'اعرف المزيد',
  'Event details': 'تفاصيل الفعالية', 'View event': 'عرض الفعالية',
  'View course': 'عرض الدورة', 'Explore course': 'اكتشف الدورة',
  'View campaign': 'عرض الحملة', 'Explore campaign': 'اكتشف الحملة',
  'Support this campaign': 'ادعم هذه الحملة', 'Online': 'عبر الإنترنت',
  'Tickets not on sale': 'التذاكر غير متاحة للبيع', 'Sold out': 'اكتمل العدد',
  'Free': 'مجاناً', 'From': 'من', 'Registration': 'التسجيل', 'Tickets': 'تذاكر',
  'Get tickets': 'احجز تذكرتك', 'Book a place': 'احجز مكانك',
  'Download': 'تنزيل', 'Read document': 'اقرأ المستند', 'View document': 'عرض المستند',
  'All articles': 'جميع الأخبار', 'All events': 'جميع الفعاليات', 'All courses': 'جميع الدورات',
  'All campaigns': 'جميع الحملات', 'All services': 'جميع الخدمات',
  'Article': 'خبر', 'Course': 'دورة', 'Campaign': 'حملة', 'Service': 'خدمة',
  'Article unavailable': 'الخبر غير متاح', 'Course unavailable': 'الدورة غير متاحة',
  'This article is not available to view.': 'هذا الخبر غير متاح للعرض.',
  'This course is not available to view.': 'هذه الدورة غير متاحة للعرض.',
  'Browse': 'تصفّح', 'Browse courses': 'تصفّح الدورات', 'Back to': 'العودة إلى',
  'Availability': 'التوفّر', 'Course details': 'تفاصيل الدورة', 'Course options': 'خيارات الدورة',
  'Course enrolment': 'التسجيل في الدورة', 'Open article photograph': 'فتح صورة الخبر',
  'Children': 'الأطفال', 'Adults': 'البالغون', 'Families': 'العائلات', 'Everyone': 'الجميع',
  'Starts': 'البداية', 'Ends': 'النهاية', 'Monthly': 'شهرياً', 'One payment': 'دفعة واحدة',
  'No places currently available': 'لا توجد أماكن متاحة حالياً', 'Not supplied': 'غير محدد',
  'Payment': 'الدفع', 'Price': 'السعر', 'Term fee': 'رسوم الفصل', 'Updated': 'آخر تحديث',
  'Where': 'المكان', 'Who it is for': 'الفئة المستهدفة', 'Open document': 'فتح المستند',
  'Word document': 'مستند Word', 'Support this appeal': 'ادعم هذا النداء',
  'View available sessions and enrolment details.': 'اطّلع على الجلسات المتاحة وتفاصيل التسجيل.',
  'min read': 'دقائق للقراءة', '% of target reached': '% من الهدف',
});

export const templateMessageKeys = Object.freeze(Object.keys(arabic));
const language = value => typeof value === 'string' && value.length <= 35
  ? value.toLowerCase().split('-')[0] : 'en';

/** Unknown copy/languages retain the supplied English UI fallback. Output remains autoescaped. */
export function templateMessage(message, locale) {
  if (typeof message !== 'string') return '';
  return language(locale) === 'ar' && Object.hasOwn(arabic, message) ? arabic[message] : message;
}

// Exactly six formatter instances at most. No per-tenant or arbitrary-pattern cache growth.
const formatters = new Map();
export function templateDate(value, locale, style = 'date') {
  // A timestamp needs an explicit offset. Date.parse on a zone-less timestamp would depend
  // on the kit author's machine rather than the host's UTC rendering contract.
  if (typeof value !== 'string' || value.length > 64 || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return '';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || !['date', 'datetime'].includes(style)) return '';
  const day = value.slice(0, 10);
  if (new Date(Date.parse(`${day}T00:00:00Z`)).toISOString().slice(0, 10) !== day) return '';
  const lang = ['ar', 'cy'].includes(language(locale)) ? language(locale) : 'en-GB';
  const key = `${lang}:${style}`;
  if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat(lang, {
    calendar: 'gregory', timeZone: 'UTC', day: '2-digit', month: 'long', year: 'numeric',
    ...(style === 'datetime' ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}),
  }));
  return formatters.get(key).format(timestamp);
}
