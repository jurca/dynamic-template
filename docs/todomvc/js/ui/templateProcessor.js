/**
 * @template T
 * @typedef {{}} Ref<T extends Element>
 * @property {null|T} current
 */

/**
 * @param {DynamicDocumentFragment} templateInstance
 * @param {(undefined|null|boolean|number|string|Node|Ref|function(event: Event): void)[]} values
 * @return void
 */
function templateProcessor(templateInstance, values) {
	for (let i = 0; i < templateInstance.parts.length; i++) {
		const part = templateInstance.parts[i]
		const value = values[i]
		switch (part.partType) {
			case PartType.ATTRIBUTE_PART:
				if (typeof value === 'function') {
					part.element.removeAttribute(part.attributeName)
					// Using addEventListener would require tracking previously registered event listeners and removing them when
					// a new one is provided. This is simpler and good enough for this demo.
					part.element[part.attributeName] = value
				} else {
					if (part.element.hasOwnProperty(part.attributeName)) {
						part.element[part.attributeName] = value
					} else if (value === undefined || value === null || value === false) {
						part.value = null
					} else {
						part.value = `${value}`
					}
				}
				break
			case PartType.COMMENT_PART:
				part.value = value
				break
			case PartType.ELEMENT_PART:
				if (value && typeof value === 'object' && 'current' in value) {
					value.current = part.element
				}
				break
			case PartType.NODE_RANGE_PART:
				const normalizedValue = (Array.isArray(value) ? value : [value]).filter(
					item => ![undefined, null, false].includes(item)
				).map(
					item => (item instanceof Node || typeof item === 'string') ? item : `${item}`
				).flatMap(composedTemplateFlatter)
				part.replaceWith(...normalizedValue)
				break
			default:
				// ignore
				break
		}
	}

	function composedTemplateFlatter(node) {
		return node.rootNodes ? [...node.rootNodes].flatMap(composedTemplateFlatter) : node
	}
}
