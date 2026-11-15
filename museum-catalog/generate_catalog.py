#!/usr/bin/env python3
"""Генератор каталога фотографий музея (.docx): одна страница = одна карточка.

Запуск:  python3 generate_catalog.py [кол-во_карточек] [первый_номер]
По умолчанию 300 карточек, номера PH-0001 ... PH-0300.
"""
import sys
from xml.sax.saxutils import escape
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls, qn
from PIL import Image, ImageDraw, ImageFont

COUNT = int(sys.argv[1]) if len(sys.argv) > 1 else 300
START = int(sys.argv[2]) if len(sys.argv) > 2 else 1
PREFIX = "PH"
MUSEUM = "GEORGIAN TEA CULTURE MUSEUM"
SUB = "PHOTOGRAPH COLLECTION · КАТАЛОГ ФОТОГРАФИЙ"
FONT = "Arial"
OUT = "Музей_Каталог_фотографий.docx"
ACCENT = "1F4E3D"   # тёмно-зелёный «чайный»
LIGHT = "E8F0EC"
NS = nsdecls("w", "r")

# ---------------- справочники (выпадающие списки) ----------------
L = {
 "status": ["Не заполнено", "Черновик", "Заполнено", "Проверено хранителем"],
 "fund": ["Основной фонд", "Научно-вспомогательный фонд", "Временное хранение", "Обменный фонд"],
 "dateacc": ["Точная дата", "Месяц и год", "Только год", "Около (ок.)", "Предположительно", "Десятилетие", "Не установлена"],
 "era": ["До 1900 г.", "1900–1917 · Российская империя", "1918–1921 · Демократическая Республика Грузия",
         "1921–1940 · Ранний советский период", "1941–1945 · Годы войны", "1946–1960 · Послевоенный период",
         "1961–1990 · Поздний советский период", "1991–2000 · Независимая Грузия", "2001–2020", "После 2020", "Не установлена"],
 "subject": ["Сбор чайного листа", "Чайная плантация", "Чайная фабрика / переработка", "Упаковка / продукция",
             "Дегустация", "Чаепитие / быт", "Портрет", "Групповой снимок", "Пейзаж", "Архитектура",
             "Событие / праздник", "Награждение / выставка", "Наука / селекция", "Документ / репродукция", "Другое"],
 "country": ["Грузия", "Россия", "Азербайджан", "Армения", "Турция", "Иран", "Китай", "Индия", "Шри-Ланка",
             "Япония", "Великобритания", "Франция", "Германия", "США", "Другая", "Не установлена"],
 "region": ["Гурия", "Аджария", "Самегрело-Земо Сванети", "Имерети", "Абхазия", "Рача-Лечхуми и Квемо Сванети",
            "Кахети", "Тбилиси", "Квемо Картли", "Шида Картли", "Мцхета-Мтианети", "Самцхе-Джавахети",
            "За пределами Грузии", "Не установлен"],
 "authattr": ["Установлен", "Предположительно", "Студия / ателье", "Не установлен"],
 "carrier": ["Фотоотпечаток (бумага)", "Негатив стеклянный", "Негатив плёночный", "Слайд / диапозитив",
             "Цифровой файл (born-digital)", "Скан / оцифровка", "Фотооткрытка", "Фото в альбоме",
             "Дагерротип / амбротип / ферротип", "Полароид", "Другое"],
 "tech": ["Чёрно-белая", "Цветная", "Тонированная (сепия)", "Раскрашенная вручную", "Цифровая цветная", "Цифровая ч/б"],
 "film": ["Не применимо", "35 мм", "Среднеформатная (120)", "Крупноформатная", "Стеклянная пластина", "Цифровая камера", "Не установлено"],
 "orig": ["Оригинал (авторский отпечаток)", "Прижизненная копия", "Поздняя копия", "Репродукция", "Цифровая копия", "Не установлено"],
 "format": ["6×9 см", "9×12 см", "10×15 см", "13×18 см", "18×24 см", "24×30 см", "30×40 см", "Кабинет-портрет", "Визит-портрет", "Нестандартный"],
 "cond": ["Отличное", "Хорошее", "Удовлетворительное", "Плохое", "Аварийное — требует реставрации"],
 "source": ["Дар", "Покупка", "Частная коллекция", "Семейный архив", "Передача из другого музея",
            "Государственный архив", "Экспедиция / полевой сбор", "Собственная съёмка музея", "Не установлен"],
 "digital": ["Есть", "Нет", "В работе"],
 "rights": ["Музей", "Автор / наследники", "Даритель", "Общественное достояние", "Не установлены"],
 "access": ["Открытый", "Для служебного пользования", "Ограниченный"],
}

_id = [1000]
def nid():
    _id[0] += 1
    return _id[0]

RPR = f'<w:rPr><w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:cs="{FONT}"/><w:sz w:val="17"/></w:rPr>'
PH_RPR = f'<w:rPr><w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:cs="{FONT}"/><w:color w:val="9A9A9A"/><w:sz w:val="17"/></w:rPr>'

def sdt(kind, tag, alias, placeholder, items=None, multiline=False):
    """Инлайн-элемент управления содержимым (Content Control)."""
    if kind == "dd":
        li = "".join(
            f'<w:listItem w:displayText="{escape(x)}" w:value="{escape(x)}"/>' for x in items)
        spec = f"<w:dropDownList>{li}</w:dropDownList>"
    elif kind == "date":
        spec = ('<w:date><w:dateFormat w:val="dd.MM.yyyy"/><w:lid w:val="ru-RU"/>'
                '<w:storeMappedDataAs w:val="dateTime"/><w:calendar w:val="gregorian"/></w:date>')
    else:
        spec = f'<w:text{" w:multiLine=\"1\"" if multiline else ""}/>'
    return (f'<w:sdt><w:sdtPr>{RPR}<w:alias w:val="{escape(alias)}"/><w:tag w:val="{escape(tag)}"/>'
            f'<w:id w:val="{nid()}"/><w:showingPlcHdr/>{spec}</w:sdtPr>'
            f'<w:sdtContent><w:r>{PH_RPR}<w:t xml:space="preserve">{escape(placeholder)}</w:t></w:r></w:sdtContent></w:sdt>')

def bm(name, inner):
    i = nid()
    return f'<w:bookmarkStart w:id="{i}" w:name="{name}"/>{inner}<w:bookmarkEnd w:id="{i}"/>'

def cell(w, content, fill=None, span=1, bold=False, color=None, size=17):
    tcpr = f'<w:tcW w:w="{w}" w:type="dxa"/>'
    if span > 1: tcpr += f'<w:gridSpan w:val="{span}"/>'
    if fill: tcpr += f'<w:shd w:val="clear" w:color="auto" w:fill="{fill}"/>'
    tcpr += '<w:vAlign w:val="center"/>'
    if content.startswith("<"):
        body = content
    else:
        rp = f'<w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:cs="{FONT}"/>' + ("<w:b/>" if bold else "") + \
             (f'<w:color w:val="{color}"/>' if color else "") + f'<w:sz w:val="{size}"/>'
        body = f'<w:r><w:rPr>{rp}</w:rPr><w:t xml:space="preserve">{escape(content)}</w:t></w:r>'
    return f'<w:tc><w:tcPr>{tcpr}</w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/></w:pPr>{body}</w:p></w:tc>'

W = [1900, 3203, 1900, 3203]   # ширины колонок (dxa), итого 10206 = 18 см
def lab(t): return cell(W[0], t, fill="F4F6F5", bold=True, color="333333", size=16)
def sect(t): return f'<w:tr>{cell(sum(W), t.upper(), fill=ACCENT, span=4, bold=True, color="FFFFFF", size=16)}</w:tr>'
def row2(l1, v1, l2, v2): return f'<w:tr>{lab(l1)}{cell(W[1], v1)}{lab(l2)}{cell(W[3], v2)}</w:tr>'
def row1(l1, v1, h=None):
    trpr = f'<w:trPr><w:trHeight w:val="{h}"/></w:trPr>' if h else ""
    return f'<w:tr>{trpr}{lab(l1)}{cell(W[1]+W[2]+W[3], v1, span=3)}</w:tr>'

def table(rows):
    b = "".join(f'<w:{s} w:val="single" w:sz="4" w:space="0" w:color="C9D3CE"/>' for s in
                ["top", "left", "bottom", "right", "insideH", "insideV"])
    grid = "".join(f'<w:gridCol w:w="{x}"/>' for x in W)
    return (f'<w:tbl {NS}><w:tblPr><w:tblW w:w="{sum(W)}" w:type="dxa"/><w:tblBorders>{b}</w:tblBorders>'
            f'<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>'
            f'</w:tblPr><w:tblGrid>{grid}</w:tblGrid>{"".join(rows)}</w:tbl>')

def card_table(n):
    k = f"{n:04d}"
    dd = lambda tag, name: sdt("dd", tag, name, "▾ выбрать", L[tag])
    tx = lambda tag, name, ph="введите…", ml=False: sdt("text", tag, name, ph, multiline=ml)
    dt = lambda tag, name: sdt("date", tag, name, "дд.мм.гггг")
    inv = f'<w:r><w:rPr><w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}"/><w:b/><w:color w:val="{ACCENT}"/><w:sz w:val="20"/></w:rPr><w:t>{PREFIX}-{k}</w:t></w:r>'
    rows = [
        sect("1. Идентификация"),
        row2("Инвентарный номер", inv, "Статус записи", bm(f"s{k}", dd("status", "Статус записи"))),
        row1("Название", bm(f"t{k}", tx("title", "Название", "введите название фотографии…"))),
        row2("Коллекция / фонд", dd("fund", "Фонд"), "Др. номера (КП, архив)", tx("othernum", "Другие номера")),
        sect("2. Съёмка: когда, где, кто"),
        row2("Дата съёмки", bm(f"d{k}", dt("date", "Дата съёмки")), "Точность датировки", dd("dateacc", "Точность датировки")),
        row2("Дата (текстом)", tx("datetext", "Дата текстом", "напр. «ок. 1958», «1950-е»"), "Эпоха / период", bm(f"e{k}", dd("era", "Эпоха"))),
        row2("Страна", dd("country", "Страна"), "Регион", bm(f"r{k}", dd("region", "Регион"))),
        row1("Место съёмки", tx("place", "Место съёмки", "населённый пункт, плантация, фабрика, адрес…")),
        row2("Сюжет / тема", dd("subject", "Сюжет"), "Автор (фотограф)", bm(f"a{k}", tx("author", "Автор", "ФИО"))),
        row2("Атрибуция автора", dd("authattr", "Атрибуция автора"), "Люди на фото", tx("people", "Люди на фото", "ФИО, слева направо")),
        sect("3. Вид и физическое состояние"),
        row2("Вид фотографии / носитель", bm(f"c{k}", dd("carrier", "Носитель")), "Техника / цвет", dd("tech", "Техника")),
        row2("Плёнка / камера", dd("film", "Плёнка"), "Оригинал / копия", dd("orig", "Оригинал или копия")),
        row2("Формат", dd("format", "Формат"), "Точный размер, см", tx("size", "Размер", "напр. 18 × 24")),
        row2("Состояние", dd("cond", "Состояние"), "Повреждения", tx("damage", "Повреждения", "заломы, пятна, выцветание…")),
        sect("4. Поступление, хранение, права"),
        row2("Источник поступления", bm(f"q{k}", dd("source", "Источник поступления")), "Дата поступления", dt("accdate", "Дата поступления")),
        row2("Кто передал / сохранил", tx("donor", "Кто передал", "ФИО, организация"), "Документ поступления", tx("accdoc", "Акт поступления", "акт № … от …")),
        row2("Место хранения", tx("storage", "Место хранения", "фонд / шкаф / полка / папка"), "Цифровая копия", dd("digital", "Цифровая копия")),
        row2("Файл / путь", tx("file", "Файл", "PH-" + k + ".tif"), "Авторские права", dd("rights", "Права")),
        row2("Доступ", dd("access", "Доступ"), "Публикации / выставки", tx("pubs", "Публикации")),
        sect("5. Описание"),
        row1("Описание", tx("desc", "Описание", "что изображено, контекст, история снимка…", True), 900),
        row1("Надписи, штампы на обороте", tx("inscr", "Надписи", "текст надписей, штампы ателье…", True), 420),
        row1("Ключевые слова", tx("keywords", "Ключевые слова", "чай; плантация; сборщицы; Гурия…")),
        row1("Примечания", tx("notes", "Примечания", "…", True)),
        row2("Карточку заполнил", tx("filledby", "Заполнил", "ФИО"), "Дата заполнения", dt("filldate", "Дата заполнения")),
    ]
    return table(rows)

# ---------------- плейсхолдер фото ----------------
def make_placeholder(path):
    w, h = 1600, 820
    im = Image.new("RGB", (w, h), (238, 242, 240))
    d = ImageDraw.Draw(im)
    d.rectangle([12, 12, w - 13, h - 13], outline=(150, 170, 160), width=6)
    cx, cy = w // 2, h // 2 - 60
    d.rounded_rectangle([cx - 120, cy - 80, cx + 120, cy + 80], 18, outline=(120, 145, 132), width=10)
    d.ellipse([cx - 50, cy - 45, cx + 50, cy + 55], outline=(120, 145, 132), width=10)
    d.rectangle([cx - 60, cy - 105, cx + 10, cy - 80], fill=(120, 145, 132))
    try:
        f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 52)
    except OSError:
        f = ImageFont.load_default()
    t = "Нажмите на значок, чтобы вставить фото"
    tw = d.textlength(t, font=f)
    d.text(((w - tw) / 2, cy + 130), t, fill=(95, 115, 105), font=f)
    im.save(path)

def picture_sdt(paragraph, img, width_cm, k):
    run = paragraph.add_run()
    run.add_picture(img, width=Cm(width_cm))
    r = run._r
    sdt_el = parse_xml(f'<w:sdt {NS}><w:sdtPr><w:alias w:val="Фотография"/><w:tag w:val="photo"/>'
                       f'<w:id w:val="{nid()}"/><w:showingPlcHdr/><w:picture/></w:sdtPr><w:sdtContent/></w:sdt>')
    r.addprevious(sdt_el)
    sdt_el.find(qn("w:sdtContent")).append(r)

# ---------------- поля в колонтитулах ----------------
def add_field(par, instr, size=8):
    for t, extra in (("begin", ""), (None, instr), ("end", "")):
        r = par.add_run()
        r.font.size = Pt(size)
        if t:
            r._r.append(parse_xml(f'<w:fldChar {NS} w:fldCharType="{t}"/>'))
        else:
            r._r.append(parse_xml(f'<w:instrText {NS} xml:space="preserve"> {extra} </w:instrText>'))

def main():
    doc = Document()
    st = doc.styles["Normal"]
    st.font.name = FONT; st.font.size = Pt(9)
    st.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    st.paragraph_format.space_after = Pt(0)
    h1 = doc.styles["Heading 1"]
    h1.font.name = FONT; h1.font.size = Pt(14); h1.font.bold = True
    h1.font.color.rgb = RGBColor.from_string(ACCENT)
    h1.element.rPr.rFonts.set(qn("w:ascii"), FONT); h1.element.rPr.rFonts.set(qn("w:hAnsi"), FONT)
    h1.paragraph_format.space_before = Pt(0); h1.paragraph_format.space_after = Pt(4)
    h1.paragraph_format.page_break_before = True

    s = doc.sections[0]
    s.page_width, s.page_height = Cm(21), Cm(29.7)
    s.left_margin = s.right_margin = Cm(1.5)
    s.top_margin, s.bottom_margin = Cm(1.6), Cm(1.3)
    s.header_distance, s.footer_distance = Cm(0.6), Cm(0.5)

    hp = s.header.paragraphs[0]; hp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = hp.add_run(MUSEUM); r.bold = True; r.font.size = Pt(11)
    r.font.color.rgb = RGBColor.from_string(ACCENT)
    hp2 = s.header.add_paragraph(); hp2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = hp2.add_run(SUB); r.font.size = Pt(7.5); r.font.color.rgb = RGBColor(0x77, 0x77, 0x77)
    fp = s.footer.paragraphs[0]; fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = fp.add_run("Внутренняя музейная карточка · стр. "); r.font.size = Pt(8)
    add_field(fp, "PAGE"); r = fp.add_run(" из "); r.font.size = Pt(8); add_field(fp, "NUMPAGES")

    # ---------- страница 1: инструкция ----------
    t = doc.add_paragraph(); t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = t.add_run("КАТАЛОГ ФОТОГРАФИЙ"); r.bold = True; r.font.size = Pt(22); r.font.color.rgb = RGBColor.from_string(ACCENT)
    t = doc.add_paragraph(); t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = t.add_run(f"{COUNT} карточек · инвентарные номера {PREFIX}-{START:04d} — {PREFIX}-{START + COUNT - 1:04d} · 1 страница = 1 фотография")
    r.font.size = Pt(10); r.font.color.rgb = RGBColor(0x55, 0x55, 0x55)
    doc.add_paragraph()
    help_items = [
        ("Как заполнять", "Каждая карточка — отдельная страница. Нажмите на серое поле и печатайте. Поля «▾ выбрать» — выпадающие списки, «дд.мм.гггг» — календарь. Клик по значку в рамке фото → выбор файла с фотографией (она сама впишется в рамку)."),
        ("Быстрый переход", "Вид → Область навигации (Mac: View → Sidebar → Navigation Pane). Слева появятся все номера PH-…: клик — и вы на нужной карточке. Также на странице «Реестр» каждый номер — ссылка (Cmd + клик)."),
        ("Поиск и фильтрация", "Cmd + F (Windows: Ctrl + F) и введите любое значение: «Негатив стеклянный», «Гурия», «1958», фамилию автора. Панель покажет список всех карточек, где оно встречается — это и есть фильтр по категории. Все значения списков написаны одинаково, поэтому поиск находит их точно."),
        ("Обновление Реестра", "Реестр собирает название, дату, эпоху, регион, носитель, автора и статус из карточек автоматически. Чтобы обновить: Cmd + A, затем F9 (на Mac: Fn + F9). Пустые карточки показывают «▾ выбрать» / «введите…»."),
        ("Сортировка", "В Реестре выделите таблицу → Макет (Table Layout) → Сортировка (Sort) — по любому столбцу: по эпохе, региону, носителю, статусу. Ссылки при этом сохраняются."),
        ("Инвентарные номера", f"Номера постоянные и идут подряд: {PREFIX}-{START:04d}, {PREFIX}-{START + 1:04d}, … Не меняйте номер у заполненной карточки и не используйте его повторно. Если фото списано — поставьте статус и пометку в «Примечаниях»."),
        ("Статус записи", "Ставьте «Черновик» / «Заполнено» / «Проверено хранителем» — так поиском по статусу видно, что ещё осталось сделать."),
    ]
    for head, body in help_items:
        p = doc.add_paragraph(); p.paragraph_format.space_after = Pt(6)
        r = p.add_run(head + ". "); r.bold = True; r.font.color.rgb = RGBColor.from_string(ACCENT); r.font.size = Pt(10)
        r = p.add_run(body); r.font.size = Pt(10)

    # ---------- Реестр ----------
    p = doc.add_paragraph("Реестр фотографий", style="Heading 1")
    p2 = doc.add_paragraph("Номер — ссылка на карточку. Обновить данные: Cmd + A → F9.")
    p2.runs[0].font.size = Pt(8); p2.runs[0].font.color.rgb = RGBColor(0x77, 0x77, 0x77)
    RW = [1050, 2600, 950, 1350, 1300, 1350, 1606 - 0]  # итого ≈ 10206
    RW[-1] = 10206 - sum(RW[:-1])
    heads = ["Инв. №", "Название", "Дата", "Эпоха", "Регион", "Носитель", "Автор / Статус"]
    def rc(w, inner, fill=None):
        f = f'<w:shd w:val="clear" w:color="auto" w:fill="{fill}"/>' if fill else ""
        return (f'<w:tc><w:tcPr><w:tcW w:w="{w}" w:type="dxa"/>{f}</w:tcPr><w:p><w:pPr><w:spacing w:before="10" w:after="10"/></w:pPr>{inner}</w:p></w:tc>')
    def rt(txt, color=None, bold=False, size=14):
        rp = f'<w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}"/>' + ("<w:b/>" if bold else "") + (f'<w:color w:val="{color}"/>' if color else "") + f'<w:sz w:val="{size}"/>'
        return f'<w:r><w:rPr>{rp}</w:rPr><w:t xml:space="preserve">{escape(txt)}</w:t></w:r>'
    def ref(b):
        return f'<w:fldSimple w:instr=" REF {b} \\h ">{rt("—", "9A9A9A")}</w:fldSimple>'
    rows = ['<w:tr><w:trPr><w:tblHeader/></w:trPr>' + "".join(rc(w, rt(h, "FFFFFF", True), ACCENT) for w, h in zip(RW, heads)) + "</w:tr>"]
    for n in range(START, START + COUNT):
        k = f"{n:04d}"
        link = f'<w:hyperlink w:anchor="{PREFIX}{k}">{rt(f"{PREFIX}-{k}", ACCENT, True)}</w:hyperlink>'
        fill = "F4F6F5" if n % 2 == 0 else None
        rows.append("<w:tr><w:trPr><w:cantSplit/></w:trPr>" + rc(RW[0], link, fill) + rc(RW[1], ref(f"t{k}"), fill) + rc(RW[2], ref(f"d{k}"), fill)
                    + rc(RW[3], ref(f"e{k}"), fill) + rc(RW[4], ref(f"r{k}"), fill) + rc(RW[5], ref(f"c{k}"), fill)
                    + rc(RW[6], ref(f"a{k}") + rt(" · ", "9A9A9A") + ref(f"s{k}"), fill) + "</w:tr>")
    b = "".join(f'<w:{x} w:val="single" w:sz="4" w:space="0" w:color="C9D3CE"/>' for x in ["top", "left", "bottom", "right", "insideH", "insideV"])
    reg = (f'<w:tbl {NS}><w:tblPr><w:tblW w:w="10206" w:type="dxa"/><w:tblBorders>{b}</w:tblBorders><w:tblLayout w:type="fixed"/>'
           f'<w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>'
           + "".join(f'<w:gridCol w:w="{w}"/>' for w in RW) + "</w:tblGrid>" + "".join(rows) + "</w:tbl>")
    body = doc.element.body
    body.insert(len(body) - 1, parse_xml(reg))

    # ---------- карточки ----------
    img = "placeholder_photo.png"; make_placeholder(img)
    for n in range(START, START + COUNT):
        k = f"{n:04d}"
        h = doc.add_paragraph(style="Heading 1")
        i = nid()
        h._p.append(parse_xml(f'<w:bookmarkStart {NS} w:id="{i}" w:name="{PREFIX}{k}"/>'))
        r = h.add_run(f"{PREFIX}-{k}")
        h._p.append(parse_xml(f'<w:bookmarkEnd {NS} w:id="{i}"/>'))
        r2 = h.add_run("   Карточка фотографии"); r2.font.size = Pt(10); r2.font.color.rgb = RGBColor(0x88, 0x88, 0x88); r2.bold = False
        pp = doc.add_paragraph(); pp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        pp.paragraph_format.space_after = Pt(4)
        picture_sdt(pp, img, 17, k)
        body.insert(len(body) - 1, parse_xml(card_table(n)))
    z = doc.settings.element.find(qn("w:zoom"))
    if z is not None: z.set(qn("w:percent"), "100")
    doc.save(OUT)
    print("OK:", OUT, COUNT, "карточек")

if __name__ == "__main__":
    main()
