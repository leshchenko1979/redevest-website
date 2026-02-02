#!/usr/bin/env python3
"""
Общие утилиты для работы с CSS файлами и анализа использования классов.
"""

import re
import os
import glob
from pathlib import Path

# Dynamic path resolution relative to this script's location
SCRIPT_DIR = Path(__file__).parent
WEBSITE_ROOT = SCRIPT_DIR.parent.parent

# Default configuration for CSS analysis
DEFAULT_CSS_FILE = WEBSITE_ROOT / "src" / "input.css"

DEFAULT_SEARCH_PATHS = [
    str(WEBSITE_ROOT / "src" / "*.html"),  # All HTML files in src directory
    str(WEBSITE_ROOT / "src" / "partials"),  # All files in partials directory
    str(WEBSITE_ROOT / "src" / "common.js"),  # JavaScript file
]


def get_css_classes(css_file, ignore_comments=True):
    """Извлекает все CSS классы из файла"""
    # Convert Path objects to strings
    css_file = str(css_file)
    with open(css_file, "r", encoding="utf-8") as f:
        content = f.read()

    if ignore_comments:
        # Удаляем комментарии /* ... */ и // ...
        content = re.sub(r"/\*.*?\*/", "", content, flags=re.DOTALL)
        content = re.sub(r"//.*", "", content)
        # Находим классы только в CSS правилах (не в комментариях)
        # Ищем паттерн: .class-name { или .class-name,
        classes = set(re.findall(r"\.([a-zA-Z][a-zA-Z0-9_-]*)\s*[,{]", content))
    else:
        # Находим все классы вида .class-name (включая комментарии)
        classes = set(re.findall(r"\.([a-zA-Z][a-zA-Z0-9_-]*)", content))

    return classes


def expand_search_paths(paths):
    """Расширяет пути с glob паттернами"""
    expanded_paths = []

    for path in paths:
        if "*" in path or "?" in path:  # Check for glob patterns
            matches = glob.glob(path)
            expanded_paths.extend(matches)
        else:
            expanded_paths.append(path)

    return expanded_paths


def get_used_classes(files_and_dirs):
    """Извлекает все используемые классы из файлов"""
    used_classes = set()

    # Расширяем пути с glob паттернами
    expanded_paths = expand_search_paths(files_and_dirs)

    # Собираем все файлы для проверки
    files_to_check = []

    for item in expanded_paths:
        if os.path.isfile(item):
            files_to_check.append(item)
        elif os.path.isdir(item):
            for root, dirs, files in os.walk(item):
                for file in files:
                    if file.endswith((".html", ".js")):
                        files_to_check.append(os.path.join(root, file))

    for file_path in files_to_check:
        if os.path.exists(file_path):
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            # Находим классы в class="..." атрибутах (HTML)
            matches = re.findall(r'class="([^"]*)"', content)
            for match in matches:
                classes = match.split()
                used_classes.update(classes)

            # Находим классы в JS коде (classList.add/remove/toggle/contains)
            js_class_matches = re.findall(
                r'classList\.(?:add|remove|toggle|contains)\(\s*[\'"]([^\'"]+)[\'"]',
                content,
            )
            used_classes.update(js_class_matches)

            # Находим классы в className= (React-style, на всякий случай)
            className_matches = re.findall(r'className="([^"]*)"', content)
            for match in className_matches:
                classes = match.split()
                used_classes.update(classes)

    return used_classes


def find_unused_classes(css_file, search_paths=None, ignore_comments=True):
    """Находит неиспользуемые CSS классы"""
    if search_paths is None:
        search_paths = DEFAULT_SEARCH_PATHS

    css_classes = get_css_classes(css_file, ignore_comments)
    used_classes = get_used_classes(search_paths)

    unused = css_classes - used_classes
    return sorted(unused)


def remove_unused_from_css(css_file, search_paths=None):
    """Удаляет неиспользуемые стили из CSS файла"""
    unused = find_unused_classes(css_file, search_paths, ignore_comments=False)

    if not unused:
        print("Не найдено неиспользуемых стилей!")
        return

    print(f"Найдено {len(unused)} неиспользуемых классов:")
    for cls in unused:
        print(f"  .{cls}")

    # Читаем CSS файл
    with open(css_file, "r", encoding="utf-8") as f:
        content = f.read()

    # Удаляем правила для неиспользуемых классов
    # Это упрощенная версия - находим строки вида ".unused-class { ..."
    for cls in unused:
        # Ищем паттерн: .class-name { ... } включая многострочные правила
        pattern = rf"\s*\.{re.escape(cls)}\s*{{[^}}]*}}"
        content = re.sub(pattern, "", content, flags=re.MULTILINE | re.DOTALL)

    # Записываем обратно
    with open(css_file, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"Удалено {len(unused)} неиспользуемых стилей из {css_file}")


def print_unused_analysis(unused):
    """Выводит анализ неиспользуемых стилей с группировкой по категориям"""
    if not unused:
        print("✅ Все стили используются!")
        return

    print(f"\n❌ Найдено {len(unused)} неиспользуемых классов:")
    print("=" * 50)

    # Группируем по категориям для лучшей читаемости
    categories = {
        "Кнопки": [cls for cls in unused if cls.startswith("btn-")],
        "Карточки": [cls for cls in unused if cls.startswith("card")],
        "Контент": [cls for cls in unused if cls.startswith("content-")],
        "Формы": [cls for cls in unused if cls.startswith("form-")],
        "Фичи": [cls for cls in unused if cls.startswith("feature-")],
        "FAQ": [cls for cls in unused if cls.startswith("faq-")],
        "Футер": [cls for cls in unused if cls.startswith("footer")],
        "Навигация": [cls for cls in unused if cls.startswith("nav")],
        "Секции": [cls for cls in unused if cls.startswith("section")],
        "Анимации": [
            cls for cls in unused if "anim" in cls or "fade" in cls or "slide" in cls
        ],
        "Другое": [],
    }

    # Оставшиеся классы идут в "Другое"
    for cls in unused:
        found = False
        for category_classes in categories.values():
            if cls in category_classes:
                found = True
                break
        if not found:
            categories["Другое"].append(cls)

    for category, classes in categories.items():
        if classes:
            print(f"\n📁 {category}:")
            for cls in sorted(classes):
                print(f"  .{cls}")

    print(f"\n💡 Всего: {len(unused)} неиспользуемых классов")
