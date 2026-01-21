#!/usr/bin/env python3
"""
Скрипт для анализа неиспользуемых CSS классов с красивым выводом
"""
from css_utils import find_unused_classes, print_unused_analysis, DEFAULT_CSS_FILE

if __name__ == "__main__":
    print("🔍 Анализ неиспользуемых стилей в CSS...")
    unused = find_unused_classes(DEFAULT_CSS_FILE, ignore_comments=True)

    print_unused_analysis(unused)