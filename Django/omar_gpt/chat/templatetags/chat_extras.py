from django import template

register = template.Library()

@register.filter
def get_item(dictionary, key):
    return dictionary.get(key)

@register.filter
def contains_arabic(value):
    import re
    return bool(re.search(r'[\u0600-\u06FF]', value))

@register.filter
def trim(value):
    """Remove leading and trailing whitespace from a string"""
    if isinstance(value, str):
        return value.strip()
    return value
