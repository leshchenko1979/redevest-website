#!/usr/bin/env python3
"""
Скрипт для автоматического удаления неиспользуемых CSS классов из input.css
"""

from css_utils import find_unused_classes, remove_unused_from_css, DEFAULT_CSS_FILE

if __name__ == "__main__":

    print("Анализ неиспользуемых стилей...")
    unused = find_unused_classes(DEFAULT_CSS_FILE, ignore_comments=False)

    if unused:
        print(f"\nНайдено {len(unused)} неиспользуемых классов:")
        for cls in unused[:20]:  # Показываем первые 20
            print(f"  .{cls}")
        if len(unused) > 20:
            print(f"  ... и еще {len(unused) - 20}")

        # Автоматическое удаление
        # Автоматически отвечаем "y" согласно документации команды
        remove_unused_from_css(DEFAULT_CSS_FILE)
    else:
        print("Все стили используются!")
