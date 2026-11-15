"""
Grounding library, fully ported from the original Base44 project's
shared/tactics.js (Make Time, Knapp & Zeratsky - 87 tactics across 4 stages).

An LLM is NEVER allowed to invent a tactic outside this list - every
tactic_id it returns is checked against find_tactic() before it reaches the
user or the database (see services/coach_tactics.py, validate_tactic). This file is the single
source of truth for that check.
"""
from dataclasses import dataclass

STAGES = ["highlight", "laser", "energize", "reflect"]

STAGE_LABELS = {
    "highlight": {"en": "Highlight", "fa": "هایلایت"},
    "laser": {"en": "Laser", "fa": "لیزر"},
    "energize": {"en": "Energize", "fa": "انرژی"},
    "reflect": {"en": "Reflect", "fa": "بازبینی"},
}


@dataclass(frozen=True)
class Tactic:
    id: int
    stage: str
    friction: int  # inherent resistance/difficulty: 1 easy .. 5 hard
    title_en: str
    title_fa: str
    desc_en: str
    desc_fa: str


TACTICS: list[Tactic] = [
    # ---------- HIGHLIGHT (1-20) ----------
    Tactic(1, "highlight", 1, "Choose a Highlight", "یک هایلایت انتخاب کن", "Pick the single most important thing for today.", "مهم‌ترین کار امروز را انتخاب کن."),
    Tactic(2, "highlight", 1, "Write It Down", "بنویسش", "Write your highlight on paper.", "هایلایت را روی کاغذ بنویس."),
    Tactic(3, "highlight", 2, "Night Before", "شب قبل", "Choose tomorrow's highlight tonight.", "هایلایت فردا را امشب انتخاب کن."),
    Tactic(4, "highlight", 2, "Calendar Block", "بلوک تقویم", "Put your highlight on the calendar.", "هایلایت را در تقویم قرار بده."),
    Tactic(5, "highlight", 2, "One Intention", "یک نیت", "Set one guiding word for the day.", "یک کلمه راهنما برای روز تعیین کن."),
    Tactic(6, "highlight", 3, "Burner List", "فهرست اجاق", "Front burner + back burner priorities.", "اولویت‌های اجاق جلو و عقب را مشخص کن."),
    Tactic(7, "highlight", 2, "The Maydo List", "فهرست شاید", "Keep an optional secondary list.", "یک فهرست اختیاری دوم نگه دار."),
    Tactic(8, "highlight", 2, "Shutdown Checklist", "فهرست خاموشی", "Run a closing routine at day end.", "روتین پایان روز را اجرا کن."),
    Tactic(9, "highlight", 2, "Make It Joyful", "شادش کن", "Choose work you look forward to.", "کاری انتخاب کن که مشتاقش باشی."),
    Tactic(10, "highlight", 1, "Mindful Choice", "انتخاب آگاهانه", "Don't autopilot your day.", "روزت را خودکار نگذران."),
    Tactic(11, "highlight", 1, "Share It", "به اشتراک‌گذار", "Tell someone your highlight.", "هایلایتت را به کسی بگو."),
    Tactic(12, "highlight", 1, "Time Estimate", "تخمین زمان", "Estimate how long it takes.", "تخمین بزن چقدر طول می‌کشد."),
    Tactic(13, "highlight", 2, "Batch Small Stuff", "خرد کارها را گروه کن", "Group tiny tasks together.", "کارهای کوچک را با هم گروه کن."),
    Tactic(14, "highlight", 3, "Reverse Engineer", "مهندسی معکوس", "Work backward from the goal.", "از هدف به‌عقب کار کن."),
    Tactic(15, "highlight", 1, "The Why Test", "تست چرایی", "Know why it matters.", "بدان چرا مهم است."),
    Tactic(16, "highlight", 1, "Weekend Highlight", "هایلایت آخر هفته", "Pick one highlight for the weekend.", "یک هایلایت برای آخر هفته انتخاب کن."),
    Tactic(17, "highlight", 2, "Stack Highlights", "انباشتن هایلایت", "Build on yesterday's progress.", "روی پیشرفت دیروز بساز."),
    Tactic(18, "highlight", 2, "Make It Personal", "شخصی‌اش کن", "Connect work to your values.", "کار را به ارزش‌هایت وصل کن."),
    Tactic(19, "highlight", 3, "Make It Challenging", "چالشش کن", "Pick something hard.", "چیزی سخت انتخاب کن."),
    Tactic(20, "highlight", 2, "Make It a Ritual", "آیینش کن", "Repeat it at the same time daily.", "آن را هر روز سر وقت ثابت تکرار کن."),

    # ---------- LASER (21-45) ----------
    Tactic(21, "laser", 2, "Invisible Phone", "گوشی نامرئی", "Hide your phone out of sight.", "گوشی را از دید دور بگذار."),
    Tactic(22, "laser", 4, "Distraction-Free Phone", "گوشی بدون حواس‌پرتی", "Remove distracting apps.", "اپ‌های حواس‌پرتی را حذف کن."),
    Tactic(23, "laser", 2, "Log Out", "خارج شو", "Sign out of accounts after use.", "بعد از استفاده از حساب‌ها خارج شو."),
    Tactic(24, "laser", 2, "Quit Notifications", "نوتیفیکیشن‌ها را قطع کن", "Turn off all alerts.", "همه هشدارها را خاموش کن."),
    Tactic(25, "laser", 3, "Paper Phone", "گوشی کاغذی", "Carry only paper notes instead.", "به جای گوشی فقط یادداشت کاغذی همراه داشته باش."),
    Tactic(26, "laser", 1, "Wristwatch", "مچ‌بند", "Wear a watch instead of checking phone.", "به جای چک کردن گوشی ساعت بپوش."),
    Tactic(27, "laser", 2, "Leave Devices Behind", "دستگاه‌ها را جا بگذار", "Walk without your phone.", "بدون گوشی قدم بزن."),
    Tactic(28, "laser", 3, "Change the Channel", "کانال را عوض کن", "Swap a bad habit for a good one.", "عادت بد را با عادت خوب عوض کن."),
    Tactic(29, "laser", 2, "Ignore the News", "اخبار را نادیده بگیر", "Stop checking headlines.", "چک کردن اخبار را متوقف کن."),
    Tactic(30, "laser", 2, "Block Time Holes", "سوراخ‌های زمان را ببند", "Fill dead time deliberately.", "زمان‌های مرده را عمدی پر کن."),
    Tactic(31, "laser", 5, "Hard Reset", "ریست سخت", "Factory reset your phone.", "گوشی را به تنظیمات کارخانه برگردان."),
    Tactic(32, "laser", 1, "Intention Timer", "تایمر نیت", "Time your laser session.", "جلسه تمرکزت را زمان‌بندی کن."),
    Tactic(33, "laser", 1, "Kitchen Timer", "تایمر آشپزخانه", "Use a physical timer.", "از یک تایمر فیزیکی استفاده کن."),
    Tactic(34, "laser", 2, "Flow Timer", "تایمر جریان", "Work in 90-minute blocks.", "در بلوک‌های ۹۰ دقیقه‌ای کار کن."),
    Tactic(35, "laser", 2, "No Screens in Bed", "بدون صفحه در تخت", "Ban devices from the bedroom.", "دستگاه‌ها را از اتاق خواب ممنوع کن."),
    Tactic(36, "laser", 3, "One Tab", "یک زبانه", "Keep a single browser tab open.", "فقط یک زبانه مرورگر باز نگه دار."),
    Tactic(37, "laser", 1, "Close Your Laptop", "لپ‌تاپ را ببند", "Flip it shut between tasks.", "بین کارها لپ‌تاپ را ببند."),
    Tactic(38, "laser", 1, "Full Screen", "تمام‌صفحه", "Hide other apps behind one window.", "اپ‌های دیگر را پشت یک پنجره مخفی کن."),
    Tactic(39, "laser", 3, "Find Your Flow", "جریانت را پیدا کن", "Single-task deeply.", "عمیقاً فقط یک کار انجام بده."),
    Tactic(40, "laser", 2, "Distraction-Free Workspace", "فضای بدون حواس‌پرتی", "Clear your desk before focusing.", "قبل از تمرکز میزت را مرتب کن."),
    Tactic(41, "laser", 1, "Hide Your Phone", "گوشی را مخفی کن", "Keep it out of sight.", "آن را از دید دور نگه دار."),
    Tactic(42, "laser", 1, "Slow Your Breath", "نفس‌هایت را کند کن", "Calm down before focusing.", "قبل از تمرکز آرام شو."),
    Tactic(43, "laser", 2, "The Quiet Hour", "ساعت سکوت", "Take one fully silent hour.", "یک ساعت کاملاً بی‌صدا داشته باش."),
    Tactic(44, "laser", 1, "Airplane Mode", "حالت هواپیما", "Cut all connections.", "همه ارتباط‌ها را قطع کن."),
    Tactic(45, "laser", 1, "Do Not Disturb", "مزاحم نشو", "Block interruptions.", "موانع را مسدود کن."),

    # ---------- ENERGIZE (46-70) ----------
    Tactic(46, "energize", 3, "Move Every Day", "هر روز حرکت کن", "Exercise daily.", "هر روز ورزش کن."),
    Tactic(47, "energize", 2, "Coffee Nap", "چرت کافئین", "Caffeine right before a 20-min nap.", "کافئین را دقیقاً قبل از چرت ۲۰ دقیقه‌ای مصرف کن."),
    Tactic(48, "energize", 2, "Power Nap", "چرت کوتاه", "A 20-minute nap.", "یک خواب کوتاه ۲۰ دقیقه‌ای."),
    Tactic(49, "energize", 3, "Eat Real Food", "غذای واقعی بخور", "Choose whole unprocessed foods.", "غذای کامل و فرآوری‌نشده انتخاب کن."),
    Tactic(50, "energize", 4, "Keep It Empty", "خالی نگه‌دار", "Skip a meal occasionally.", "گاهی یک وعده را حذف کن."),
    Tactic(51, "energize", 2, "Forest Bath", "حمام جنگل", "Walk in nature.", "در طبیعت قدم بزن."),
    Tactic(52, "energize", 2, "Optimize Caffeine", "کافئین را بهینه کن", "Time it strategically.", "مصرفش را استراتژیک زمان‌بندی کن."),
    Tactic(53, "energize", 4, "Cold Shower", "دوش سرد", "Boost alertness with cold water.", "با آب سرد هوشیاری را بالا ببر."),
    Tactic(54, "energize", 1, "Deep Breath", "نفس عمیق", "Reset with conscious breathing.", "با تنفس آگاهانه ریست شو."),
    Tactic(55, "energize", 1, "Drink Water", "آب بنوش", "Stay hydrated.", "آب بدنت را حفظ کن."),
    Tactic(56, "energize", 3, "Sleep Enough", "کافی بخواب", "Get 7 to 8 hours of sleep.", "۷ تا ۸ ساعت بخواب."),
    Tactic(57, "energize", 1, "Morning Light", "نور صبح", "Get sunlight early in the day.", "اوایل روز نور خورشید بگیر."),
    Tactic(58, "energize", 2, "Evening Wind-Down", "آرامش شب", "Slow down before bed.", "قبل از خواب آرام شو."),
    Tactic(59, "energize", 1, "Eat Slowly", "آرام غذا بخور", "Practice mindful eating.", "غذا خوردن آگاهانه را تمرین کن."),
    Tactic(60, "energize", 1, "Walk and Talk", "قدم و گفتار", "Hold walking meetings.", "جلسات را حین قدم زدن برگزار کن."),
    Tactic(61, "energize", 1, "Exercise Snack", "میان‌وعده ورزش", "Do short mini-workouts.", "تمرین‌های کوتاه و کوچک انجام بده."),
    Tactic(62, "energize", 1, "Take a Break", "استراحت کن", "Take real breaks, not scrolling.", "استراحت واقعی کن، نه تلفن چک کردن."),
    Tactic(63, "energize", 3, "Disconnect", "قطع ارتباط", "Spend time off-grid.", "مدتی بدون شبکه باش."),
    Tactic(64, "energize", 2, "Connect with People", "ارتباط با آدم‌ها", "Socialize and talk.", "اجتماعی باش و گفت‌وگو کن."),
    Tactic(65, "energize", 1, "Gratitude", "شکرگزاری", "Note what is good.", "خوبی‌ها را یادت باشد."),
    Tactic(66, "energize", 1, "Stretch", "کشش", "Loosen your body.", "بدنت را شل کن."),
    Tactic(67, "energize", 1, "Make Your Bed", "تختت را مرتب کن", "A small win first thing.", "یک موفقیت کوچک اول صبح."),
    Tactic(68, "energize", 1, "Music for Focus", "موسیقی تمرکز", "Soundtrack your work.", "برای کارت موسیقی بگذار."),
    Tactic(69, "energize", 1, "Get Outside", "بیرون برو", "Daylight matters.", "نور روز مهم است."),
    Tactic(70, "energize", 2, "Breath of Fire", "نفس آتشین", "An energizing breathing pattern.", "یک الگوی تنفس انرژی‌بخش."),

    # ---------- REFLECT (71-87) ----------
    Tactic(71, "reflect", 2, "Daily Review", "بازبینی روزانه", "Reflect every night.", "هر شب بازبینی کن."),
    Tactic(72, "reflect", 2, "Weekly Review", "بازبینی هفتگی", "See the bigger picture each week.", "هر هفته تصویر کلی را ببین."),
    Tactic(73, "reflect", 2, "Track Your Time", "زمانت را ثبت کن", "Log how you spend your hours.", "ثبت کن ساعاتت را چطور می‌گذرانی."),
    Tactic(74, "reflect", 1, "What Worked", "چه چیزی جواب داد", "Note your successes.", "موفقیت‌ها را یادداشت کن."),
    Tactic(75, "reflect", 1, "What Didn't", "چه چیزی جواب نداد", "Note your failures.", "شکست‌ها را یادداشت کن."),
    Tactic(76, "reflect", 2, "Experiment Mindset", "ذهنیت آزمایش", "Treat each day as a test.", "هر روز را یک آزمایش بدان."),
    Tactic(77, "reflect", 2, "The Patch", "وصله", "Fix one thing tomorrow.", "فردا یک چیز را اصلاح کن."),
    Tactic(78, "reflect", 1, "Bug Log", "گزارش باگ", "Track your distractions.", "حواس‌پرتی‌ها را ثبت کن."),
    Tactic(79, "reflect", 1, "The Notebook", "دفترچه", "Write it all down.", "همه را بنویس."),
    Tactic(80, "reflect", 1, "Rate Your Day", "روزت را امتیاز بده", "Give the day 1 to 5 stars.", "به روزت ۱ تا ۵ ستاره بده."),
    Tactic(81, "reflect", 1, "The Tally", "شمارش", "Count your completions.", "تکمیل‌ها را بشمار."),
    Tactic(82, "reflect", 2, "Before/After", "قبل و بعد", "Compare changes over time.", "تغییرات را در طول زمان مقایسه کن."),
    Tactic(83, "reflect", 1, "Highlight Tally", "شمارش هایلایت", "Count highlight completions.", "تکمیل هایلایت‌ها را بشمار."),
    Tactic(84, "reflect", 2, "Energy Audit", "ممیزی انرژی", "Track your energy levels.", "سطوح انرژی‌ات را پیگیری کن."),
    Tactic(85, "reflect", 2, "Distraction Audit", "ممیزی حواس‌پرتی", "Review what distracted you.", "بازبینی کن چه چیز حواست را پرت کرد."),
    Tactic(86, "reflect", 2, "Laser Audit", "ممیزی لیزر", "Measure your focus time.", "زمان تمرکزت را اندازه بگیر."),
    Tactic(87, "reflect", 1, "Make Time Tally", "شمارش زمان‌سازی", "Compute your overall score.", "امتیاز کلی‌ات را محاسبه کن."),
]

_by_id = {t.id: t for t in TACTICS}


def find_tactic(tactic_id: int) -> Tactic | None:
    return _by_id.get(tactic_id)


def tactics_for_stage(stage: str) -> list[Tactic]:
    """
    Only inject the tactics relevant to one stage into a prompt, instead of
    all 87 - keeps the prompt short, which matters a lot for a cheap model's
    reliability and for token cost.
    """
    return [t for t in TACTICS if t.stage == stage]


def format_tactics_for_prompt(stage: str, lang: str = "fa", with_desc: bool = False) -> str:
    lines = []
    for t in tactics_for_stage(stage):
        title = t.title_fa if lang == "fa" else t.title_en
        if with_desc:
            desc = t.desc_fa if lang == "fa" else t.desc_en
            lines.append(f"{t.id} | {title} — {desc} | friction={t.friction}")
        else:
            lines.append(f"{t.id} | {title} | friction={t.friction}")
    return "\n".join(lines)


def tactic_of_day(date_str: str | None) -> Tactic:
    """Ported from tacticOfDay in the original JS - a stable pseudo-random
    pick per calendar date, used only as a cold-start fallback (e.g. when a
    user has no history yet), never as a substitute for the real Chains."""
    if not date_str:
        return TACTICS[0]
    seed = sum(int(p) for p in date_str.split("-"))
    return TACTICS[seed % len(TACTICS)]
