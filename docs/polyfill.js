"use strict";
document.createDynamicTemplate = (...htmlFragments) => {
    // A "real" polyfill or native implementation would not need to inject any helper attributes or elements, as it can
    // just keep track of which nodes and places in child nodes will be dynamic, and store that information in a separate
    // object. I assume that, to implement such behavior, a polyfill would need to parse the HTML code the same way a
    // browser's HTML parser would (i.e. handle malformed HTML or incorrect element nesting correctly).
    // Also, a native implementation (or a more advanced polyfill) can provide a more reliable SVG support. All that's
    // needed for that is to hook into Node.prototype.{append,appendChild,insertBefore,...} and check whether the dynamic
    // template is being injected into an SVG context or HTML context. However, as the code below demonstrates, in many
    // situations it can be determined from the provided markup itself whether it's SVG or HTML code.
    if (!htmlFragments.length || (htmlFragments.length === 1 && !htmlFragments)) {
        throw new Error('At least one html fragment must be provided, and the fragment must not be an empty string');
    }
    const isSvg = (() => {
        const SVG_ONLY_ELEMENTS = [
            'altGlyph', 'altGlyphDef', 'altGlyphItem', 'animate', 'animateColor', 'animateMotion', 'animateTransform',
            'circle', 'clipPath', 'color-profile', 'cursor', 'defs', 'desc', 'ellipse', 'feBlend', 'feColorMatrix',
            'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap',
            'feDistantLight', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge',
            'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile',
            'feTurbulence', 'filter', 'font-face', 'font-face-format', 'font-face-name', 'font-face-src', 'font-face-uri',
            'foreignObject', 'g', 'glyph', 'glyphRef', 'hkern', 'line', 'linearGradient', 'marker', 'mask', 'metadata',
            'missing-glyph', 'mpath', 'path', 'pattern', 'polygon', 'polyline', 'radialGradient', 'rect', 'set', 'stop',
            'switch', 'symbol', 'text', 'textPath', 'tref', 'tspan', 'use', 'view', 'vkern',
        ];
        // Element names shared by SVG and HTML
        const SHARED_ELEMENTS = ['a', 'font', 'image', 'script', 'style', 'title'];
        const completeMarkup = htmlFragments.join('');
        const firstElementStart = completeMarkup.indexOf('<');
        if (firstElementStart === -1) {
            return false;
        }
        const firstElementName = completeMarkup.slice(firstElementStart + 1).match(/^\s*([^\s:=/>]+)/)?.[1];
        if (!firstElementName) {
            throw new Error(`Invalid markup - missing element name at position ${firstElementStart}: ${completeMarkup}`);
        }
        if (SVG_ONLY_ELEMENTS.includes(firstElementName)) {
            return true;
        }
        if (!SHARED_ELEMENTS.includes(firstElementName)) {
            return false;
        }
        try {
            const parser = new DOMParser();
            // An SVG markup must be a well-formed XML
            const parsedMarkup = parser.parseFromString(completeMarkup, 'text/xml');
            const caseInsensitiveParsedMarkup = parser.parseFromString(completeMarkup, 'text/html');
            if (caseInsensitiveParsedMarkup.querySelector('svg')) {
                return false;
            }
            // Let's call this an educated guess that works reliably enough
            return !!parsedMarkup.querySelector(`[${SVG_ONLY_ELEMENTS}]`);
        }
        catch (parsingError) {
            return false;
        }
    })();
    const currentDynamicAttributes = [];
    let isInsideElement = false;
    let isInsideComment = false;
    const processedFragments = htmlFragments.map((fragment, fragmentIndex, { length: fragmentCount }) => {
        let currentPosition = 0;
        do {
            if (isInsideComment) {
                currentPosition = fragment.indexOf('-->', currentPosition);
                if (currentPosition === -1) {
                    throw new Error(`The ${fragmentIndex}. fragment contains an unterminated comment. Dynamic comments are not supported by ` +
                        `this polyfill.`);
                }
                currentPosition += 4;
                isInsideComment = false;
            }
            else if (isInsideElement) {
                const elementEnd = fragment.indexOf('>', currentPosition);
                if (elementEnd === -1) { // Dynamic attribute or element
                    const valueSeparator = fragment.lastIndexOf('=');
                    if (valueSeparator === -1) {
                        currentDynamicAttributes.push('');
                    }
                    else {
                        if (/^\s*(?:"[^"]*"|'[^']*'|[^\s"']*(?:\s|$))/.test(fragment.slice(valueSeparator + 1))) {
                            // The last attribute before this fragment's end is already fully-formed
                            currentDynamicAttributes.push('');
                        }
                        else {
                            let attributeNameEnd = valueSeparator - 1;
                            while (/\s/.test(fragment.charAt(attributeNameEnd))) {
                                attributeNameEnd--;
                            }
                            let attributeNameStart = attributeNameEnd;
                            while (attributeNameStart && /\S/.test(fragment.charAt(attributeNameStart - 1))) {
                                attributeNameStart--;
                            }
                            const attributeName = fragment.slice(attributeNameStart, attributeNameEnd + 1);
                            currentDynamicAttributes.push(attributeName);
                        }
                    }
                    currentPosition = -1;
                }
                else {
                    // Skip attributes of the current element up to the position of potential element end
                    while (true) {
                        const nextAttributeValueDelimiterIndex = fragment.slice(0, elementEnd).indexOf('=', currentPosition);
                        if (nextAttributeValueDelimiterIndex === -1) {
                            break;
                        }
                        currentPosition = nextAttributeValueDelimiterIndex + 1;
                        while (/\s/.test(fragment.charAt(currentPosition))) {
                            currentPosition++;
                        }
                        if (/["']/.test(fragment.charAt(currentPosition))) {
                            const valueDelimiter = fragment.charAt(currentPosition);
                            currentPosition = fragment.indexOf(valueDelimiter, currentPosition) + 1;
                        }
                        else {
                            while (/[^\s>]/.test(fragment.charAt(currentPosition))) {
                                currentPosition++;
                            }
                        }
                    }
                    if (currentPosition > elementEnd) {
                        // This was a false positive, the ">" character was inside an attribute's value
                    }
                    else {
                        isInsideElement = false;
                        if (currentDynamicAttributes.length) {
                            const dynamicAttributesNote = ` data-dtpp-attributes="${currentDynamicAttributes.splice(0).join(';')}"`;
                            fragment = fragment.slice(0, elementEnd) + dynamicAttributesNote + fragment.slice(elementEnd);
                            currentPosition = elementEnd + dynamicAttributesNote.length + 1;
                        }
                        else {
                            currentPosition = elementEnd + 1;
                        }
                    }
                }
            }
            else {
                currentPosition = fragment.indexOf('<', currentPosition);
                if (currentPosition > -1) {
                    if (fragment.startsWith('<!--', currentPosition)) {
                        isInsideComment = true;
                        currentPosition += 4;
                    }
                    else {
                        isInsideElement = true;
                        do {
                            currentPosition++;
                        } while (/\s/.test(fragment.charAt(currentPosition)));
                        while (/[^\s:=/>]/.test(fragment.charAt(currentPosition))) {
                            currentPosition++;
                        }
                        while (/\s/.test(fragment.charAt(currentPosition))) {
                            currentPosition++;
                        }
                    }
                }
                else if (fragmentIndex < fragmentCount - 1) {
                    const markerElement = isSvg ? 'g' : 'span';
                    fragment += `<${markerElement} data-dtpp-nodes=""></${markerElement}>`;
                }
            }
        } while (currentPosition > -1);
        return fragment;
    });
    const template = document.createElement('template');
    template.innerHTML = isSvg ? `<svg>${processedFragments.join('')}</svg>` : processedFragments.join('');
    if (isSvg) {
        const svgRoot = template.content.firstElementChild;
        while (svgRoot.firstChild) {
            template.content.insertBefore(svgRoot.firstChild, svgRoot);
        }
        template.content.removeChild(svgRoot);
    }
    return new DynamicDocumentTemplateImpl(template.content);
};
class DynamicDocumentTemplateImpl {
    constructor(parsedTemplate) {
        this.parsedTemplate = parsedTemplate;
    }
    instantiate(processor, processorArguments) {
        const instanceFragment = this.parsedTemplate.cloneNode(true);
        const placesWithDynamicParts = instanceFragment.querySelectorAll('[data-dtpp-attributes],[data-dtpp-nodes]');
        const parts = [];
        for (let i = 0, { length } = placesWithDynamicParts; i < length; i++) {
            const place = placesWithDynamicParts[i];
            if (place.hasAttribute('data-dtpp-attributes')) {
                const attributes = place.getAttribute('data-dtpp-attributes');
                const partsForAttributes = new Map(); // Used for deduplication
                for (const attribute of attributes.split(';')) {
                    const part = partsForAttributes.get(attribute) || (attribute ?
                        new DynamicTemplateAttributePartImpl(place, place.getAttributeNode(attribute))
                        :
                            new DynamicTemplateElementPartImpl(place));
                    partsForAttributes.set(attribute, part);
                    parts.push(part);
                }
                place.removeAttribute('data-dtpp-attributes');
            }
            if (place.hasAttribute('data-dtpp-nodes')) {
                const start = document.createComment('');
                const end = document.createComment('');
                place.parentNode.replaceChild(end, place);
                end.parentNode.insertBefore(start, end);
                const nodeRange = new NodeRangeImpl(start, end);
                parts.push(new DynamicTemplateNodeRangePartImpl(nodeRange));
            }
        }
        const instance = Object.assign(instanceFragment, {
            processor: processor || null,
            parts: new DynamicTemplatePartListImpl(parts),
            rootNodes: new LiveRootNodeListImpl(instanceFragment),
        });
        if (processor) {
            processor(instance, processorArguments);
        }
        return instance;
    }
}
class DynamicTemplatePartListImpl {
    constructor(parts) {
        this.parts = parts;
        Object.assign(this, parts);
        this.length = parts.length;
    }
    item(index) {
        return this[index] || null;
    }
    keys() {
        return this.parts.keys();
    }
    values() {
        return this.parts.values();
    }
    entries() {
        return this.parts.entries();
    }
    forEach(callback, thisValue) {
        this.parts.forEach((value, index) => {
            callback.call(thisValue, value, index, this);
        });
    }
    [Symbol.iterator]() {
        return this.parts[Symbol.iterator]();
    }
}
class AbstractDynamicTemplatePart {
    constructor(partType) {
        this.partType = partType;
        this.ATTRIBUTE_PART = PartType.ATTRIBUTE_PART;
        this.ELEMENT_PART = PartType.ELEMENT_PART;
        this.NODE_RANGE_PART = PartType.NODE_RANGE_PART;
        this.COMMENT_PART = PartType.COMMENT_PART;
    }
}
class DynamicTemplateAttributePartImpl extends AbstractDynamicTemplatePart {
    constructor(element, attribute) {
        super(PartType.ATTRIBUTE_PART);
        this.element = element;
        this.attribute = attribute;
        this.attributeName = this.attribute.name;
    }
    get value() {
        return this.attribute.value;
    }
    set value(value) {
        if (typeof value === 'string') {
            this.attribute.value = value;
            this.element.setAttributeNode(this.attribute);
        }
        else if (this.element.hasAttribute(this.attribute.name)) {
            this.element.removeAttributeNode(this.attribute);
        }
    }
}
class DynamicTemplateElementPartImpl extends AbstractDynamicTemplatePart {
    constructor(element) {
        super(PartType.ELEMENT_PART);
        this.element = element;
    }
}
class DynamicTemplateNodeRangePartImpl extends AbstractDynamicTemplatePart {
    constructor(nodes) {
        super(PartType.NODE_RANGE_PART);
        this.nodes = nodes;
    }
    get parentNode() {
        return this.nodes.parentNode;
    }
    replaceWith(...nodes) {
        const currentNodes = [...this.nodes];
        // Normalize the input, allowing existing text nodes to be reused for matching strings in input
        const currentTextNodes = currentNodes.filter(node => node.nodeType === node.TEXT_NODE);
        const currentTextNodesMappableToNewStrings = currentTextNodes.filter(textNode => !nodes.includes(textNode));
        const normalizedNodes = nodes.map(node => {
            if (node instanceof Node) {
                return node;
            }
            const reusableNodeIndex = currentTextNodesMappableToNewStrings.findIndex(textNode => textNode.nodeValue === node);
            if (reusableNodeIndex > -1) {
                const reusableNode = currentTextNodesMappableToNewStrings.splice(reusableNodeIndex, 1)[0];
                return reusableNode;
            }
            return document.createTextNode(node);
        });
        // Remove the nodes that are no longer in the input
        for (const node of currentNodes) {
            if (!normalizedNodes.includes(node)) {
                this.nodes.removeNode(node);
            }
        }
        // Reorder preserved nodes
        const firstPreservedNode = currentNodes.find(node => normalizedNodes.includes(node));
        if (firstPreservedNode) {
            let currentNode = firstPreservedNode;
            for (const node of normalizedNodes) {
                if (currentNodes.includes(node)) {
                    if (node !== currentNode) {
                        this.nodes.insertBefore(node, currentNode);
                    }
                    else {
                        currentNode = currentNode.nextSibling;
                    }
                }
            }
        }
        // Insert new nodes
        let insertBeforeNode = firstPreservedNode || null;
        for (const node of normalizedNodes) {
            if (node !== insertBeforeNode) {
                this.nodes.insertBefore(node, insertBeforeNode);
            }
            else {
                insertBeforeNode = insertBeforeNode && insertBeforeNode.nextSibling;
            }
        }
    }
}
class NodeRangeImpl {
    constructor(startingBoundary, endingBoundary) {
        this.startingBoundary = startingBoundary;
        this.endingBoundary = endingBoundary;
        return new Proxy(this, {
            has(target, propertyKey) {
                if (typeof propertyKey === 'number') {
                    return !!target.item(propertyKey);
                }
                return Reflect.has(target, propertyKey);
            },
            get(target, propertyKey) {
                if (typeof propertyKey === 'number') {
                    return target.item(propertyKey) || undefined;
                }
                return target[propertyKey];
            },
            set(target, propertyKey, value, receiver) {
                if (typeof value !== 'string' && !(value instanceof Node)) {
                    throw new TypeError(`Only strings and DOM Nodes can be set to indexes of a NodeRange, ${value} was provided`);
                }
                const normalizedValue = typeof value === 'string' ? document.createTextNode(value) : value;
                if (typeof propertyKey === 'number') {
                    const node = target.item(propertyKey);
                    if (node) {
                        target.replaceNode(normalizedValue, node);
                        return true;
                    }
                    if (propertyKey === target.length) {
                        target.appendNode(normalizedValue);
                        return true;
                    }
                    return false;
                }
                return Reflect.set(target, propertyKey, value, receiver);
            },
            deleteProperty(target, propertyKey) {
                if (typeof propertyKey === 'number') {
                    const node = target.item(propertyKey);
                    if (node) {
                        target.removeNode(node);
                        return true;
                    }
                    return false;
                }
                return Reflect.deleteProperty(target, propertyKey);
            },
            ownKeys(target) {
                const keys = Reflect.ownKeys(target);
                const { length } = target;
                for (let index = 0; index < length; index++) {
                    keys.push(index);
                }
                return keys;
            },
        });
    }
    get parentNode() {
        const parentNode = this.startingBoundary.parentNode;
        if (!parentNode) {
            // This should (might?) be preventable in a native implementation since it might not have to rely on boundary
            // nodes.
            throw new Error('The boundary nodes used by this polyfill no longer have a parent node because they were removed from it by ' +
                'a third party. Therefore, the parent node of this node range cannot be located.');
        }
        return parentNode;
    }
    get length() {
        let countedNode = this.startingBoundary.nextSibling;
        let count = 0;
        while (countedNode && countedNode !== this.endingBoundary) {
            count++;
            countedNode = countedNode.nextSibling;
        }
        return count;
    }
    item(index) {
        if (index < 0) {
            return null;
        }
        let node = this.startingBoundary.nextSibling;
        while (index--) {
            if (!node || node === this.endingBoundary) {
                return null;
            }
            node = node.nextSibling;
        }
        return node;
    }
    replaceNode(newNode, oldNode) {
        this.parentNode.replaceChild(newNode, oldNode);
    }
    insertBefore(newNode, refNode) {
        this.parentNode.insertBefore(newNode, refNode || this.endingBoundary);
    }
    appendNode(node) {
        this.parentNode.insertBefore(node, this.endingBoundary);
    }
    removeNode(node) {
        this.parentNode.removeChild(node);
    }
    keys() {
        const nodeRange = this;
        return function* () {
            for (const [key] of nodeRange.entries()) {
                yield key;
            }
        }();
    }
    values() {
        const nodeRange = this;
        return function* () {
            for (const [, node] of nodeRange.entries()) {
                yield node;
            }
        }();
    }
    entries() {
        let node = this.startingBoundary.nextSibling;
        const end = this.endingBoundary;
        return function* () {
            let key = 0;
            while (node && node !== end) {
                yield [key, node];
                node = node.nextSibling;
                key++;
            }
        }();
    }
    forEach(callback, thisValue) {
        for (const [index, node] of this.entries()) {
            callback.call(thisValue, node, index, this);
        }
    }
    [Symbol.iterator]() {
        return this.values();
    }
}
class LiveRootNodeListImpl {
    constructor(nodesContainer) {
        this.trackedNodes = [...nodesContainer.childNodes];
        return new Proxy(this, {
            has(target, propertyKey) {
                if (typeof propertyKey === 'number') {
                    return !!target.item(propertyKey);
                }
                return Reflect.has(target, propertyKey);
            },
            get(target, propertyKey) {
                if (typeof propertyKey === 'number') {
                    return target.item(propertyKey) || undefined;
                }
                return target[propertyKey];
            },
            ownKeys(target) {
                const keys = Reflect.ownKeys(target);
                const { length } = target;
                for (let index = 0; index < length; index++) {
                    keys.push(index);
                }
                return keys;
            },
        });
    }
    get length() {
        let length = 0;
        for (const _ of this.entries()) {
            length++;
        }
        return length;
    }
    item(index) {
        let currentIndex = 0;
        for (const node of this.values()) {
            if (currentIndex === index) {
                return node;
            }
            currentIndex++;
        }
        return null;
    }
    entries() {
        return this.trackedNodes.entries();
    }
    keys() {
        const nodeList = this;
        return function* () {
            for (const [key] of nodeList.entries()) {
                yield key;
            }
        }();
    }
    values() {
        const nodeList = this;
        return function* () {
            for (const [, node] of nodeList.entries()) {
                yield node;
            }
        }();
    }
    forEach(callback, thisValue) {
        for (const [index, node] of this.entries()) {
            callback.call(thisValue, node, index, this);
        }
    }
    [Symbol.iterator]() {
        return this.values();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9seWZpbGwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9wb2x5ZmlsbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsUUFBUSxDQUFDLHFCQUFxQixHQUFHLENBQUMsR0FBRyxhQUFnQyxFQUEyQixFQUFFO0lBQ2hHLG1IQUFtSDtJQUNuSCxxSEFBcUg7SUFDckgsaUhBQWlIO0lBQ2pILG1HQUFtRztJQUNuRyxrSEFBa0g7SUFDbEgscUhBQXFIO0lBQ3JILG1IQUFtSDtJQUNuSCxpR0FBaUc7SUFFakcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxFQUFFO1FBQzNFLE1BQU0sSUFBSSxLQUFLLENBQUMsMkZBQTJGLENBQUMsQ0FBQTtLQUM3RztJQUVELE1BQU0sS0FBSyxHQUFHLENBQUMsR0FBRyxFQUFFO1FBQ2xCLE1BQU0saUJBQWlCLEdBQUc7WUFDeEIsVUFBVSxFQUFFLGFBQWEsRUFBRSxjQUFjLEVBQUUsU0FBUyxFQUFFLGNBQWMsRUFBRSxlQUFlLEVBQUUsa0JBQWtCO1lBQ3pHLFFBQVEsRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsZUFBZTtZQUN0RyxxQkFBcUIsRUFBRSxhQUFhLEVBQUUsa0JBQWtCLEVBQUUsbUJBQW1CLEVBQUUsbUJBQW1CO1lBQ2xHLGdCQUFnQixFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLFNBQVM7WUFDL0csYUFBYSxFQUFFLGNBQWMsRUFBRSxVQUFVLEVBQUUsY0FBYyxFQUFFLG9CQUFvQixFQUFFLGFBQWEsRUFBRSxRQUFRO1lBQ3hHLGNBQWMsRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLGtCQUFrQixFQUFFLGdC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Q0FBQyxJQUFJLENBQUMsU0FBYyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUE7U0FDakQ7SUFDSCxDQUFDO0lBRU0sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO1FBQ3RCLE9BQU8sSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFBO0lBQ3RCLENBQUM7Q0FDRiIsInNvdXJjZXNDb250ZW50IjpbImRvY3VtZW50LmNyZWF0ZUR5bmFtaWNUZW1wbGF0ZSA9ICguLi5odG1sRnJhZ21lbnRzOiByZWFkb25seSBzdHJpbmdbXSk6IER5bmFtaWNEb2N1bWVudFRlbXBsYXRlID0+IHtcbiAgLy8gQSBcInJlYWxcIiBwb2x5ZmlsbCBvciBuYXRpdmUgaW1wbGVtZW50YXRpb24gd291bGQgbm90IG5lZWQgdG8gaW5qZWN0IGFueSBoZWxwZXIgYXR0cmlidXRlcyBvciBlbGVtZW50cywgYXMgaXQgY2FuXG4gIC8vIGp1c3Qga2VlcCB0cmFjayBvZiB3aGljaCBub2RlcyBhbmQgcGxhY2VzIGluIGNoaWxkIG5vZGVzIHdpbGwgYmUgZHluYW1pYywgYW5kIHN0b3JlIHRoYXQgaW5mb3JtYXRpb24gaW4gYSBzZXBhcmF0ZVxuICAvLyBvYmplY3QuIEkgYXNzdW1lIHRoYXQsIHRvIGltcGxlbWVudCBzdWNoIGJlaGF2aW9yLCBhIHBvbHlmaWxsIHdvdWxkIG5lZWQgdG8gcGFyc2UgdGhlIEhUTUwgY29kZSB0aGUgc2FtZSB3YXkgYVxuICAvLyBicm93c2VyJ3MgSFRNTCBwYXJzZXIgd291bGQgKGkuZS4gaGFuZGxlIG1hbGZvcm1lZCBIVE1MIG9yIGluY29ycmVjdCBlbGVtZW50IG5lc3RpbmcgY29ycmVjdGx5KS5cbiAgLy8gQWxzbywgYSBuYXRpdmUgaW1wbGVtZW50YXRpb24gKG9yIGEgbW9yZSBhZHZhbmNlZCBwb2x5ZmlsbCkgY2FuIHByb3ZpZGUgYSBtb3JlIHJlbGlhYmxlIFNWRyBzdXBwb3J0LiBBbGwgdGhhdCdzXG4gIC8vIG5lZWRlZCBmb3IgdGhhdCBpcyB0byBob29rIGludG8gTm9kZS5wcm90b3R5cGUue2FwcGVuZCxhcHBlbmRDaGlsZCxpbnNlcnRCZWZvcmUsLi4ufSBhbmQgY2hlY2sgd2hldGhlciB0aGUgZHluYW1pY1xuICAvLyB0ZW1wbGF0ZSBpcyBiZWluZyBpbmplY3RlZCBpbnRvIGFuIFNWRyBjb250ZXh0IG9yIEhUTUwgY29udGV4dC4gSG93ZXZlciwgYXMgdGhlIGNvZGUgYmVsb3cgZGVtb25zdHJhdGVzLCBpbiBtYW55XG4gIC8vIHNpdHVhdGlvbnMgaXQgY2FuIGJlIGRldGVybWluZWQgZnJvbSB0aGUgcHJvdmlkZWQgbWFya3VwIGl0c2VsZiB3aGV0aGVyIGl0J3MgU1ZHIG9yIEhUTUwgY29kZS5cblxuICBpZiAoIWh0bWxGcmFnbWVudHMubGVuZ3RoIHx8IChodG1sRnJhZ21lbnRzLmxlbmd0aCA9PT0gMSAmJiAhaHRtbEZyYWdtZW50cykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0F0IGxlYXN0IG9uZSBodG1sIGZyYWdtZW50IG11c3QgYmUgcHJvdmlkZWQsIGFuZCB0aGUgZnJhZ21lbnQgbXVzdCBub3QgYmUgYW4gZW1wdHkgc3RyaW5nJylcbiAgfVxuXG4gIGNvbnN0IGlzU3ZnID0gKCgpID0+IHtcbiAgICBjb25zdCBTVkdfT05MWV9FTEVNRU5UUyA9IFtcbiAgICAgICdhbHRHbHlwaCcsICdhbHRHbHlwaERlZicsICdhbHRHbHlwaEl0ZW0nLCAnYW5pbWF0ZScsICdhbmltYXRlQ29sb3InLCAnYW5pbWF0ZU1vdGlvbicsICdhbmltYXRlVHJhbnNmb3JtJyxcbiAgICAgICdjaXJjbGUnLCAnY2xpcFBhdGgnLCAnY29sb3ItcHJvZmlsZScsICdjdXJzb3InLCAnZGVmcycsICdkZXNjJywgJ2VsbGlwc2UnLCAnZmVCbGVuZCcsICdmZUNvbG9yTWF0cml4JyxcbiAgICAgICdmZUNvbXBvbmVudFRyYW5zZmVyJywgJ2ZlQ29tcG9zaXRlJywgJ2ZlQ29udm9sdmVNYXRyaXgnLCAnZmVEaWZmdXNlTGlnaHRpbmcnLCAnZmVEaXNwbGFjZW1lbnRNYXAnLFxuICAgICAgJ2ZlRGlzdGFudExpZ2h0JywgJ2ZlRmxvb2QnLCAnZmVGdW5jQScsICdmZUZ1bmNCJywgJ2ZlRnVuY0cnLCAnZmVGdW5jUicsICdmZUdhdXNzaWFuQmx1cicsICdmZUltYWdlJywgJ2ZlTWVyZ2UnLFxuICAgICAgJ2ZlTWVyZ2VOb2RlJywgJ2ZlTW9ycGhvbG9neScsICdmZU9mZnNldCcsICdmZVBvaW50TGlnaHQnLCAnZmVTcGVjdWxhckxpZ2h0aW5nJywgJ2ZlU3BvdExpZ2h0JywgJ2ZlVGlsZScsXG4gICAgICAnZmVUdXJidWxlbmNlJywgJ2ZpbHRlcicsICdmb250LWZhY2UnLCAnZm9udC1mYWNlLWZvcm1hdCcsICdmb250LWZhY2UtbmFtZScsICdmb250LWZhY2Utc3JjJywgJ2ZvbnQtZmFjZS11cmknLFxuICAgICAgJ2ZvcmVpZ25PYmplY3QnLCAnZycsICdnbHlwaCcsICdnbHlwaFJlZicsICdoa2VybicsICdsaW5lJywgJ2xpbmVhckdyYWRpZW50JywgJ21hcmtlcicsICdtYXNrJywgJ21ldGFkYXRhJyxcbiAgICAgICdtaXNzaW5nLWdseXBoJywgJ21wYXRoJywgJ3BhdGgnLCAncGF0dGVybicsICdwb2x5Z29uJywgJ3BvbHlsaW5lJywgJ3JhZGlhbEdyYWRpZW50JywgJ3JlY3QnLCAnc2V0JywgJ3N0b3AnLFxuICAgICAgJ3N3aXRjaCcsICdzeW1ib2wnLCAndGV4dCcsICd0ZXh0UGF0aCcsICd0cmVmJywgJ3RzcGFuJywgJ3VzZScsICd2aWV3JywgJ3ZrZXJuJyxcbiAgICBdXG4gICAgLy8gRWxlbWVudCBuYW1lcyBzaGFyZWQgYnkgU1ZHIGFuZCBIVE1MXG4gICAgY29uc3QgU0hBUkVEX0VMRU1FTlRTID0gWydhJywgJ2ZvbnQnLCAnaW1hZ2UnLCAnc2NyaXB0JywgJ3N0eWxlJywgJ3RpdGxlJ11cblxuICAgIGNvbnN0IGNvbXBsZXRlTWFya3VwID0gaHRtbEZyYWdtZW50cy5qb2luKCcnKVxuICAgIGNvbnN0IGZpcnN0RWxlbWVudFN0YXJ0ID0gY29tcGxldGVNYXJrdXAuaW5kZXhPZignPCcpXG4gICAgaWYgKGZpcnN0RWxlbWVudFN0YXJ0ID09PSAtMSkge1xuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuXG4gICAgY29uc3QgZmlyc3RFbGVtZW50TmFtZSA9IGNvbXBsZXRlTWFya3VwLnNsaWNlKGZpcnN0RWxlbWVudFN0YXJ0ICsgMSkubWF0Y2goL15cXHMqKFteXFxzOj0vPl0rKS8pPy5bMV1cbiAgICBpZiAoIWZpcnN0RWxlbWVudE5hbWUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBtYXJrdXAgLSBtaXNzaW5nIGVsZW1lbnQgbmFtZSBhdCBwb3NpdGlvbiAke2ZpcnN0RWxlbWVudFN0YXJ0fTogJHtjb21wbGV0ZU1hcmt1cH1gKVxuICAgIH1cblxuICAgIGlmIChTVkdfT05MWV9FTEVNRU5UUy5pbmNsdWRlcyhmaXJzdEVsZW1lbnROYW1lKSkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG4gICAgaWYgKCFTSEFSRURfRUxFTUVOVFMuaW5jbHVkZXMoZmlyc3RFbGVtZW50TmFtZSkpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBwYXJzZXIgPSBuZXcgRE9NUGFyc2VyKClcbiAgICAgIC8vIEFuIFNWRyBtYXJrdXAgbXVzdCBiZSBhIHdlbGwtZm9ybWVkIFhNTFxuICAgICAgY29uc3QgcGFyc2VkTWFya3VwID0gcGFyc2VyLnBhcnNlRnJvbVN0cmluZyhjb21wbGV0ZU1hcmt1cCwgJ3RleHQveG1sJylcbiAgICAgIGNvbnN0IGNhc2VJbnNlbnNpdGl2ZVBhcnNlZE1hcmt1cCA9IHBhcnNlci5wYXJzZUZyb21TdHJpbmcoY29tcGxldGVNYXJrdXAsICd0ZXh0L2h0bWwnKVxuICAgICAgaWYgKGNhc2VJbnNlbnNpdGl2ZVBhcnNlZE1hcmt1cC5xdWVyeVNlbGVjdG9yKCdzdmcnKSkge1xuICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgIH1cblxuICAgICAgLy8gTGV0J3MgY2FsbCB0aGlzIGFuIGVkdWNhdGVkIGd1ZXNzIHRoYXQgd29ya3MgcmVsaWFibHkgZW5vdWdoXG4gICAgICByZXR1cm4gISFwYXJzZWRNYXJrdXAucXVlcnlTZWxlY3RvcihgWyR7U1ZHX09OTFlfRUxFTUVOVFN9XWApXG4gICAgfSBjYXRjaCAocGFyc2luZ0Vycm9yKSB7XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG4gIH0pKClcblxuICBjb25zdCBjdXJyZW50RHluYW1pY0F0dHJpYnV0ZXM6IHN0cmluZ1tdID0gW11cbiAgbGV0IGlzSW5zaWRlRWxlbWVudCA9IGZhbHNlXG4gIGxldCBpc0luc2lkZUNvbW1lbnQgPSBmYWxzZVxuICBjb25zdCBwcm9jZXNzZWRGcmFnbWVudHMgPSBodG1sRnJhZ21lbnRzLm1hcCgoZnJhZ21lbnQsIGZyYWdtZW50SW5kZXgsIHtsZW5ndGg6IGZyYWdtZW50Q291bnR9KSA9PiB7XG4gICAgbGV0IGN1cnJlbnRQb3NpdGlvbiA9IDBcbiAgICBkbyB7XG4gICAgICBpZiAoaXNJbnNpZGVDb21tZW50KSB7XG4gICAgICAgIGN1cnJlbnRQb3NpdGlvbiA9IGZyYWdtZW50LmluZGV4T2YoJy0tPicsIGN1cnJlbnRQb3NpdGlvbilcbiAgICAgICAgaWYgKGN1cnJlbnRQb3NpdGlvbiA9PT0gLTEpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICBgVGhlICR7ZnJhZ21lbnRJbmRleH0uIGZyYWdtZW50IGNvbnRhaW5zIGFuIHVudGVybWluYXRlZCBjb21tZW50LiBEeW5hbWljIGNvbW1lbnRzIGFyZSBub3Qgc3VwcG9ydGVkIGJ5IGAgK1xuICAgICAgICAgICAgYHRoaXMgcG9seWZpbGwuYCxcbiAgICAgICAgICApXG4gICAgICAgIH1cbiAgICAgICAgY3VycmVudFBvc2l0aW9uICs9IDRcbiAgICAgICAgaXNJbnNpZGVDb21tZW50ID0gZmFsc2VcbiAgICAgIH0gZWxzZSBpZiAoaXNJbnNpZGVFbGVtZW50KSB7XG4gICAgICAgIGNvbnN0IGVsZW1lbnRFbmQgPSBmcmFnbWVudC5pbmRleE9mKCc+JywgY3VycmVudFBvc2l0aW9uKVxuICAgICAgICBpZiAoZWxlbWVudEVuZCA9PT0gLTEpIHsgLy8gRHluYW1pYyBhdHRyaWJ1dGUgb3IgZWxlbWVudFxuICAgICAgICAgIGNvbnN0IHZhbHVlU2VwYXJhdG9yID0gZnJhZ21lbnQubGFzdEluZGV4T2YoJz0nKVxuICAgICAgICAgIGlmICh2YWx1ZVNlcGFyYXRvciA9PT0gLTEpIHtcbiAgICAgICAgICAgIGN1cnJlbnREeW5hbWljQXR0cmlidXRlcy5wdXNoKCcnKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoL15cXHMqKD86XCJbXlwiXSpcInwnW14nXSonfFteXFxzXCInXSooPzpcXHN8JCkpLy50ZXN0KGZyYWdtZW50LnNsaWNlKHZhbHVlU2VwYXJhdG9yICsgMSkpKSB7XG4gICAgICAgICAgICAgIC8vIFRoZSBsYXN0IGF0dHJpYnV0ZSBiZWZvcmUgdGhpcyBmcmFnbWVudCdzIGVuZCBpcyBhbHJlYWR5IGZ1bGx5LWZvcm1lZFxuICAgICAgICAgICAgICBjdXJyZW50RHluYW1pY0F0dHJpYnV0ZXMucHVzaCgnJylcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGxldCBhdHRyaWJ1dGVOYW1lRW5kID0gdmFsdWVTZXBhcmF0b3IgLSAxXG4gICAgICAgICAgICAgIHdoaWxlICgvXFxzLy50ZXN0KGZyYWdtZW50LmNoYXJBdChhdHRyaWJ1dGVOYW1lRW5kKSkpIHtcbiAgICAgICAgICAgICAgICBhdHRyaWJ1dGVOYW1lRW5kLS1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBsZXQgYXR0cmlidXRlTmFtZVN0YXJ0ID0gYXR0cmlidXRlTmFtZUVuZFxuICAgICAgICAgICAgICB3aGlsZSAoYXR0cmlidXRlTmFtZVN0YXJ0ICYmIC9cXFMvLnRlc3QoZnJhZ21lbnQuY2hhckF0KGF0dHJpYnV0ZU5hbWVTdGFydCAtIDEpKSkge1xuICAgICAgICAgICAgICAgIGF0dHJpYnV0ZU5hbWVTdGFydC0tXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgY29uc3QgYXR0cmlidXRlTmFtZSA9IGZyYWdtZW50LnNsaWNlKGF0dHJpYnV0ZU5hbWVTdGFydCwgYXR0cmlidXRlTmFtZUVuZCArIDEpXG4gICAgICAgICAgICAgIGN1cnJlbnREeW5hbWljQXR0cmlidXRlcy5wdXNoKGF0dHJpYnV0ZU5hbWUpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGN1cnJlbnRQb3NpdGlvbiA9IC0xXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gU2tpcCBhdHRyaWJ1dGVzIG9mIHRoZSBjdXJyZW50IGVsZW1lbnQgdXAgdG8gdGhlIHBvc2l0aW9uIG9mIHBvdGVudGlhbCBlbGVtZW50IGVuZFxuICAgICAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgICAgICBjb25zdCBuZXh0QXR0cmlidXRlVmFsdWVEZWxpbWl0ZXJJbmRleCA9IGZyYWdtZW50LnNsaWNlKDAsIGVsZW1lbnRFbmQpLmluZGV4T2YoJz0nLCBjdXJyZW50UG9zaXRpb24pXG4gICAgICAgICAgICBpZiAobmV4dEF0dHJpYnV0ZVZhbHVlRGVsaW1pdGVySW5kZXggPT09IC0xKSB7XG4gICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjdXJyZW50UG9zaXRpb24gPSBuZXh0QXR0cmlidXRlVmFsdWVEZWxpbWl0ZXJJbmRleCArIDFcbiAgICAgICAgICAgIHdoaWxlICgvXFxzLy50ZXN0KGZyYWdtZW50LmNoYXJBdChjdXJyZW50UG9zaXRpb24pKSkge1xuICAgICAgICAgICAgICBjdXJyZW50UG9zaXRpb24rK1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKC9bXCInXS8udGVzdChmcmFnbWVudC5jaGFyQXQoY3VycmVudFBvc2l0aW9uKSkpIHtcbiAgICAgICAgICAgICAgY29uc3QgdmFsdWVEZWxpbWl0ZXIgPSBmcmFnbWVudC5jaGFyQXQoY3VycmVudFBvc2l0aW9uKVxuICAgICAgICAgICAgICBjdXJyZW50UG9zaXRpb24gPSBmcmFnbWVudC5pbmRleE9mKHZhbHVlRGVsaW1pdGVyLCBjdXJyZW50UG9zaXRpb24pICsgMVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgd2hpbGUgKC9bXlxccz5dLy50ZXN0KGZyYWdtZW50LmNoYXJBdChjdXJyZW50UG9zaXRpb24pKSkge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRQb3NpdGlvbisrXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGN1cnJlbnRQb3NpdGlvbiA+IGVsZW1lbnRFbmQpIHtcbiAgICAgICAgICAgIC8vIFRoaXMgd2FzIGEgZmFsc2UgcG9zaXRpdmUsIHRoZSBcIj5cIiBjaGFyYWN0ZXIgd2FzIGluc2lkZSBhbiBhdHRyaWJ1dGUncyB2YWx1ZVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpc0luc2lkZUVsZW1lbnQgPSBmYWxzZVxuICAgICAgICAgICAgaWYgKGN1cnJlbnREeW5hbWljQXR0cmlidXRlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgY29uc3QgZHluYW1pY0F0dHJpYnV0ZXNOb3RlID0gYCBkYXRhLWR0cHAtYXR0cmlidXRlcz1cIiR7Y3VycmVudER5bmFtaWNBdHRyaWJ1dGVzLnNwbGljZSgwKS5qb2luKCc7Jyl9XCJgXG4gICAgICAgICAgICAgIGZyYWdtZW50ID0gZnJhZ21lbnQuc2xpY2UoMCwgZWxlbWVudEVuZCkgKyBkeW5hbWljQXR0cmlidXRlc05vdGUgKyBmcmFnbWVudC5zbGljZShlbGVtZW50RW5kKVxuICAgICAgICAgICAgICBjdXJyZW50UG9zaXRpb24gPSBlbGVtZW50RW5kICsgZHluYW1pY0F0dHJpYnV0ZXNOb3RlLmxlbmd0aCArIDFcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGN1cnJlbnRQb3NpdGlvbiA9IGVsZW1lbnRFbmQgKyAxXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjdXJyZW50UG9zaXRpb24gPSBmcmFnbWVudC5pbmRleE9mKCc8JywgY3VycmVudFBvc2l0aW9uKVxuICAgICAgICBpZiAoY3VycmVudFBvc2l0aW9uID4gLTEpIHtcbiAgICAgICAgICBpZiAoZnJhZ21lbnQuc3RhcnRzV2l0aCgnPCEtLScsIGN1cnJlbnRQb3NpdGlvbikpIHtcbiAgICAgICAgICAgIGlzSW5zaWRlQ29tbWVudCA9IHRydWVcbiAgICAgICAgICAgIGN1cnJlbnRQb3NpdGlvbiArPSA0XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlzSW5zaWRlRWxlbWVudCA9IHRydWVcbiAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgY3VycmVudFBvc2l0aW9uKytcbiAgICAgICAgICAgIH0gd2hpbGUgKC9cXHMvLnRlc3QoZnJhZ21lbnQuY2hhckF0KGN1cnJlbnRQb3NpdGlvbikpKVxuICAgICAgICAgICAgd2hpbGUgKC9bXlxcczo9Lz5dLy50ZXN0KGZyYWdtZW50LmNoYXJBdChjdXJyZW50UG9zaXRpb24pKSkge1xuICAgICAgICAgICAgICBjdXJyZW50UG9zaXRpb24rK1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgd2hpbGUgKC9cXHMvLnRlc3QoZnJhZ21lbnQuY2hhckF0KGN1cnJlbnRQb3NpdGlvbikpKSB7XG4gICAgICAgICAgICAgIGN1cnJlbnRQb3NpdGlvbisrXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGZyYWdtZW50SW5kZXggPCBmcmFnbWVudENvdW50IC0gMSkge1xuICAgICAgICAgIGNvbnN0IG1hcmtlckVsZW1lbnQgPSBpc1N2ZyA/ICdnJyA6ICdzcGFuJ1xuICAgICAgICAgIGZyYWdtZW50ICs9IGA8JHttYXJrZXJFbGVtZW50fSBkYXRhLWR0cHAtbm9kZXM9XCJcIj48LyR7bWFya2VyRWxlbWVudH0+YFxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSB3aGlsZSAoY3VycmVudFBvc2l0aW9uID4gLTEpXG4gICAgcmV0dXJuIGZyYWdtZW50XG4gIH0pXG5cbiAgY29uc3QgdGVtcGxhdGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0ZW1wbGF0ZScpXG4gIHRlbXBsYXRlLmlubmVySFRNTCA9IGlzU3ZnID8gYDxzdmc+JHtwcm9jZXNzZWRGcmFnbWVudHMuam9pbignJyl9PC9zdmc+YCA6IHByb2Nlc3NlZEZyYWdtZW50cy5qb2luKCcnKVxuICBpZiAoaXNTdmcpIHtcbiAgICBjb25zdCBzdmdSb290ID0gdGVtcGxhdGUuY29udGVudC5maXJzdEVsZW1lbnRDaGlsZCFcbiAgICB3aGlsZSAoc3ZnUm9vdC5maXJzdENoaWxkKSB7XG4gICAgICB0ZW1wbGF0ZS5jb250ZW50Lmluc2VydEJlZm9yZShzdmdSb290LmZpcnN0Q2hpbGQsIHN2Z1Jvb3QpXG4gICAgfVxuICAgIHRlbXBsYXRlLmNvbnRlbnQucmVtb3ZlQ2hpbGQoc3ZnUm9vdClcbiAgfVxuXG4gIHJldHVybiBuZXcgRHluYW1pY0RvY3VtZW50VGVtcGxhdGVJbXBsKHRlbXBsYXRlLmNvbnRlbnQpXG59XG5cbmNsYXNzIER5bmFtaWNEb2N1bWVudFRlbXBsYXRlSW1wbCBpbXBsZW1lbnRzIER5bmFtaWNEb2N1bWVudFRlbXBsYXRlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSByZWFkb25seSBwYXJzZWRUZW1wbGF0ZTogRG9jdW1lbnRGcmFnbWVudCxcbiAgKSB7XG4gIH1cblxuICBpbnN0YW50aWF0ZTxBPihwcm9jZXNzb3I/OiBEeW5hbWljVGVtcGxhdGVQcm9jZXNzb3I8QT4sIHByb2Nlc3NvckFyZ3VtZW50cz86IEEpOiBEeW5hbWljRG9jdW1lbnRGcmFnbWVudDxBPiB7XG4gICAgY29uc3QgaW5zdGFuY2VGcmFnbWVudCA9IHRoaXMucGFyc2VkVGVtcGxhdGUuY2xvbmVOb2RlKHRydWUpIGFzIERvY3VtZW50RnJhZ21lbnRcbiAgICBjb25zdCBwbGFjZXNXaXRoRHluYW1pY1BhcnRzID0gaW5zdGFuY2VGcmFnbWVudC5xdWVyeVNlbGVjdG9yQWxsKFxuICAgICAgJ1tkYXRhLWR0cHAtYXR0cmlidXRlc10sW2RhdGEtZHRwcC1ub2Rlc10nLFxuICAgIClcbiAgICBjb25zdCBwYXJ0czogRHluYW1pY1RlbXBsYXRlUGFydFtdID0gW11cbiAgICBmb3IgKGxldCBpID0gMCwge2xlbmd0aH0gPSBwbGFjZXNXaXRoRHluYW1pY1BhcnRzOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IHBsYWNlID0gcGxhY2VzV2l0aER5bmFtaWNQYXJ0c1tpXVxuICAgICAgaWYgKHBsYWNlLmhhc0F0dHJpYnV0ZSgnZGF0YS1kdHBwLWF0dHJpYnV0ZXMnKSkge1xuICAgICAgICBjb25zdCBhdHRyaWJ1dGVzID0gcGxhY2UuZ2V0QXR0cmlidXRlKCdkYXRhLWR0cHAtYXR0cmlidXRlcycpIVxuICAgICAgICBjb25zdCBwYXJ0c0ZvckF0dHJpYnV0ZXMgPSBuZXcgTWFwPHN0cmluZywgRHluYW1pY1RlbXBsYXRlUGFydD4oKSAvLyBVc2VkIGZvciBkZWR1cGxpY2F0aW9uXG4gICAgICAgIGZvciAoY29uc3QgYXR0cmlidXRlIG9mIGF0dHJpYnV0ZXMuc3BsaXQoJzsnKSkge1xuICAgICAgICAgIGNvbnN0IHBhcnQgPSBwYXJ0c0ZvckF0dHJpYnV0ZXMuZ2V0KGF0dHJpYnV0ZSkgfHwgKGF0dHJpYnV0ZSA/XG4gICAgICAgICAgICBuZXcgRHluYW1pY1RlbXBsYXRlQXR0cmlidXRlUGFydEltcGwocGxhY2UsIHBsYWNlLmdldEF0dHJpYnV0ZU5vZGUoYXR0cmlidXRlKSEpXG4gICAgICAgICAgOlxuICAgICAgICAgICAgbmV3IER5bmFtaWNUZW1wbGF0ZUVsZW1lbnRQYXJ0SW1wbChwbGFjZSlcbiAgICAgICAgICApXG4gICAgICAgICAgcGFydHNGb3JBdHRyaWJ1dGVzLnNldChhdHRyaWJ1dGUsIHBhcnQpXG4gICAgICAgICAgcGFydHMucHVzaChwYXJ0KVxuICAgICAgICB9XG4gICAgICAgIHBsYWNlLnJlbW92ZUF0dHJpYnV0ZSgnZGF0YS1kdHBwLWF0dHJpYnV0ZXMnKVxuICAgICAgfVxuICAgICAgaWYgKHBsYWNlLmhhc0F0dHJpYnV0ZSgnZGF0YS1kdHBwLW5vZGVzJykpIHtcbiAgICAgICAgY29uc3Qgc3RhcnQgPSBkb2N1bWVudC5jcmVhdGVDb21tZW50KCcnKVxuICAgICAgICBjb25zdCBlbmQgPSBkb2N1bWVudC5jcmVhdGVDb21tZW50KCcnKVxuICAgICAgICBwbGFjZS5wYXJlbnROb2RlIS5yZXBsYWNlQ2hpbGQoZW5kLCBwbGFjZSlcbiAgICAgICAgZW5kLnBhcmVudE5vZGUhLmluc2VydEJlZm9yZShzdGFydCwgZW5kKVxuICAgICAgICBjb25zdCBub2RlUmFuZ2UgPSBuZXcgTm9kZVJhbmdlSW1wbChzdGFydCwgZW5kKVxuICAgICAgICBwYXJ0cy5wdXNoKG5ldyBEeW5hbWljVGVtcGxhdGVOb2RlUmFuZ2VQYXJ0SW1wbChcbiAgICAgICAgICBub2RlUmFuZ2UsXG4gICAgICAgICkpXG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgaW5zdGFuY2UgPSBPYmplY3QuYXNzaWduKGluc3RhbmNlRnJhZ21lbnQsIHtcbiAgICAgIHByb2Nlc3NvcjogcHJvY2Vzc29yIHx8IG51bGwsXG4gICAgICBwYXJ0czogbmV3IER5bmFtaWNUZW1wbGF0ZVBhcnRMaXN0SW1wbChwYXJ0cyksXG4gICAgICByb290Tm9kZXM6IG5ldyBMaXZlUm9vdE5vZGVMaXN0SW1wbChpbnN0YW5jZUZyYWdtZW50KSxcbiAgICB9KVxuICAgIGlmIChwcm9jZXNzb3IpIHtcbiAgICAgIHByb2Nlc3NvcihpbnN0YW5jZSwgcHJvY2Vzc29yQXJndW1lbnRzKVxuICAgIH1cblxuICAgIHJldHVybiBpbnN0YW5jZVxuICB9XG59XG5cbmNsYXNzIER5bmFtaWNUZW1wbGF0ZVBhcnRMaXN0SW1wbCBpbXBsZW1lbnRzIER5bmFtaWNUZW1wbGF0ZVBhcnRMaXN0IHtcbiAgcHVibGljIHJlYWRvbmx5IGxlbmd0aDogbnVtYmVyXG4gIHJlYWRvbmx5IFtpbmRleDogbnVtYmVyXTogRHluYW1pY1RlbXBsYXRlUGFydCB8IHVuZGVmaW5lZFxuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcmVhZG9ubHkgcGFydHM6IHJlYWRvbmx5IER5bmFtaWNUZW1wbGF0ZVBhcnRbXSxcbiAgKSB7XG4gICAgT2JqZWN0LmFzc2lnbih0aGlzLCBwYXJ0cylcbiAgICB0aGlzLmxlbmd0aCA9IHBhcnRzLmxlbmd0aFxuICB9XG5cbiAgcHVibGljIGl0ZW0oaW5kZXg6IG51bWJlcik6IER5bmFtaWNUZW1wbGF0ZVBhcnQgfCBudWxsIHtcbiAgICByZXR1cm4gdGhpc1tpbmRleF0gfHwgbnVsbFxuICB9XG5cbiAgcHVibGljIGtleXMoKTogSXRlcmFibGVJdGVyYXRvcjxudW1iZXI+IHtcbiAgICByZXR1cm4gdGhpcy5wYXJ0cy5rZXlzKClcbiAgfVxuXG4gIHB1YmxpYyB2YWx1ZXMoKTogSXRlcmFibGVJdGVyYXRvcjxEeW5hbWljVGVtcGxhdGVQYXJ0PiB7XG4gICAgcmV0dXJuIHRoaXMucGFydHMudmFsdWVzKClcbiAgfVxuXG4gIHB1YmxpYyBlbnRyaWVzKCk6IEl0ZXJhYmxlSXRlcmF0b3I8W251bWJlciwgRHluYW1pY1RlbXBsYXRlUGFydF0+IHtcbiAgICByZXR1cm4gdGhpcy5wYXJ0cy5lbnRyaWVzKClcbiAgfVxuXG4gIHB1YmxpYyBmb3JFYWNoPFQ+KFxuICAgIGNhbGxiYWNrOiAodGhpczogVCwgdmFsdWU6IER5bmFtaWNUZW1wbGF0ZVBhcnQsIGluZGV4OiBudW1iZXIsIGxpc3Q6IER5bmFtaWNUZW1wbGF0ZVBhcnRMaXN0KSA9PiB2b2lkLFxuICAgIHRoaXNWYWx1ZT86IFQsXG4gICk6IHZvaWQge1xuICAgIHRoaXMucGFydHMuZm9yRWFjaCgodmFsdWUsIGluZGV4KSA9PiB7XG4gICAgICBjYWxsYmFjay5jYWxsKHRoaXNWYWx1ZSBhcyBULCB2YWx1ZSwgaW5kZXgsIHRoaXMpXG4gICAgfSlcbiAgfVxuXG4gIHB1YmxpYyBbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYXRvcjxEeW5hbWljVGVtcGxhdGVQYXJ0PiB7XG4gICAgcmV0dXJuIHRoaXMucGFydHNbU3ltYm9sLml0ZXJhdG9yXSgpXG4gIH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3REeW5hbWljVGVtcGxhdGVQYXJ0PFAgZXh0ZW5kcyBQYXJ0VHlwZT4gaW1wbGVtZW50cyBEeW5hbWljVGVtcGxhdGVQYXJ0IHtcbiAgcHVibGljIHJlYWRvbmx5IEFUVFJJQlVURV9QQVJUOiBQYXJ0VHlwZS5BVFRSSUJVVEVfUEFSVCA9IFBhcnRUeXBlLkFUVFJJQlVURV9QQVJUXG4gIHB1YmxpYyByZWFkb25seSBFTEVNRU5UX1BBUlQ6IFBhcnRUeXBlLkVMRU1FTlRfUEFSVCA9IFBhcnRUeXBlLkVMRU1FTlRfUEFSVFxuICBwdWJsaWMgcmVhZG9ubHkgTk9ERV9SQU5HRV9QQVJUOiBQYXJ0VHlwZS5OT0RFX1JBTkdFX1BBUlQgPSBQYXJ0VHlwZS5OT0RFX1JBTkdFX1BBUlRcbiAgcHVibGljIHJlYWRvbmx5IENPTU1FTlRfUEFSVDogUGFydFR5cGUuQ09NTUVOVF9QQVJUID0gUGFydFR5cGUuQ09NTUVOVF9QQVJUXG5cbiAgcHJvdGVjdGVkIGNvbnN0cnVjdG9yKFxuICAgIHB1YmxpYyByZWFkb25seSBwYXJ0VHlwZTogUCxcbiAgKSB7XG4gIH1cbn1cblxuY2xhc3MgRHluYW1pY1RlbXBsYXRlQXR0cmlidXRlUGFydEltcGxcbiAgZXh0ZW5kcyBBYnN0cmFjdER5bmFtaWNUZW1wbGF0ZVBhcnQ8UGFydFR5cGUuQVRUUklCVVRFX1BBUlQ+XG4gIGltcGxlbWVudHMgRHluYW1pY1RlbXBsYXRlQXR0cmlidXRlUGFydFxue1xuICBwdWJsaWMgcmVhZG9ubHkgYXR0cmlidXRlTmFtZSA9IHRoaXMuYXR0cmlidXRlLm5hbWVcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwdWJsaWMgcmVhZG9ubHkgZWxlbWVudDogRWxlbWVudCxcbiAgICBwdWJsaWMgcmVhZG9ubHkgYXR0cmlidXRlOiBBdHRyLFxuICApIHtcbiAgICBzdXBlcihQYXJ0VHlwZS5BVFRSSUJVVEVfUEFSVCk7XG4gIH1cblxuICBwdWJsaWMgZ2V0IHZhbHVlKCk6IHN0cmluZyB8IG51bGwge1xuICAgIHJldHVybiB0aGlzLmF0dHJpYnV0ZS52YWx1ZVxuICB9XG5cbiAgcHVibGljIHNldCB2YWx1ZSh2YWx1ZTogc3RyaW5nIHwgbnVsbCkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICB0aGlzLmF0dHJpYnV0ZS52YWx1ZSA9IHZhbHVlXG4gICAgICB0aGlzLmVsZW1lbnQuc2V0QXR0cmlidXRlTm9kZSh0aGlzLmF0dHJpYnV0ZSlcbiAgICB9IGVsc2UgaWYgKHRoaXMuZWxlbWVudC5oYXNBdHRyaWJ1dGUodGhpcy5hdHRyaWJ1dGUubmFtZSkpIHtcbiAgICAgIHRoaXMuZWxlbWVudC5yZW1vdmVBdHRyaWJ1dGVOb2RlKHRoaXMuYXR0cmlidXRlKVxuICAgIH1cbiAgfVxufVxuXG5jbGFzcyBEeW5hbWljVGVtcGxhdGVFbGVtZW50UGFydEltcGxcbiAgZXh0ZW5kcyBBYnN0cmFjdER5bmFtaWNUZW1wbGF0ZVBhcnQ8UGFydFR5cGUuRUxFTUVOVF9QQVJUPlxuICBpbXBsZW1lbnRzIER5bmFtaWNUZW1wbGF0ZUVsZW1lbnRQYXJ0XG57XG4gIGNvbnN0cnVjdG9yKFxuICAgIHB1YmxpYyByZWFkb25seSBlbGVtZW50OiBFbGVtZW50LFxuICApIHtcbiAgICBzdXBlcihQYXJ0VHlwZS5FTEVNRU5UX1BBUlQpO1xuICB9XG59XG5cbmNsYXNzIER5bmFtaWNUZW1wbGF0ZU5vZGVSYW5nZVBhcnRJbXBsPFBBPlxuICBleHRlbmRzIEFic3RyYWN0RHluYW1pY1RlbXBsYXRlUGFydDxQYXJ0VHlwZS5OT0RFX1JBTkdFX1BBUlQ+XG4gIGltcGxlbWVudHMgRHluYW1pY1RlbXBsYXRlTm9kZVJhbmdlUGFydDxQQT5cbntcbiAgY29uc3RydWN0b3IoXG4gICAgcHVibGljIHJlYWRvbmx5IG5vZGVzOiBOb2RlUmFuZ2UsXG4gICkge1xuICAgIHN1cGVyKFBhcnRUeXBlLk5PREVfUkFOR0VfUEFSVCk7XG4gIH1cblxuICBwdWJsaWMgZ2V0IHBhcmVudE5vZGUoKTogRWxlbWVudCB8IER5bmFtaWNEb2N1bWVudEZyYWdtZW50PFBBPiB7XG4gICAgcmV0dXJuIHRoaXMubm9kZXMucGFyZW50Tm9kZSBhcyBFbGVtZW50IHwgRHluYW1pY0RvY3VtZW50RnJhZ21lbnQ8UEE+XG4gIH1cblxuICBwdWJsaWMgcmVwbGFjZVdpdGgoLi4ubm9kZXM6IFJlYWRvbmx5QXJyYXk8c3RyaW5nIHwgTm9kZT4pOiB2b2lkIHtcbiAgICBjb25zdCBjdXJyZW50Tm9kZXM6IE5vZGVbXSA9IFsuLi50aGlzLm5vZGVzXVxuXG4gICAgLy8gTm9ybWFsaXplIHRoZSBpbnB1dCwgYWxsb3dpbmcgZXhpc3RpbmcgdGV4dCBub2RlcyB0byBiZSByZXVzZWQgZm9yIG1hdGNoaW5nIHN0cmluZ3MgaW4gaW5wdXRcbiAgICBjb25zdCBjdXJyZW50VGV4dE5vZGVzID0gY3VycmVudE5vZGVzLmZpbHRlcihub2RlID0+IG5vZGUubm9kZVR5cGUgPT09IG5vZGUuVEVYVF9OT0RFKSBhcyBUZXh0W11cbiAgICBjb25zdCBjdXJyZW50VGV4dE5vZGVzTWFwcGFibGVUb05ld1N0cmluZ3MgPSBjdXJyZW50VGV4dE5vZGVzLmZpbHRlcih0ZXh0Tm9kZSA9PiAhbm9kZXMuaW5jbHVkZXModGV4dE5vZGUpKVxuICAgIGNvbnN0IG5vcm1hbGl6ZWROb2RlczogTm9kZVtdID0gbm9kZXMubWFwKG5vZGUgPT4ge1xuICAgICAgaWYgKG5vZGUgaW5zdGFuY2VvZiBOb2RlKSB7XG4gICAgICAgIHJldHVybiBub2RlXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJldXNhYmxlTm9kZUluZGV4ID0gY3VycmVudFRleHROb2Rlc01hcHBhYmxlVG9OZXdTdHJpbmdzLmZpbmRJbmRleChcbiAgICAgICAgdGV4dE5vZGUgPT4gdGV4dE5vZGUubm9kZVZhbHVlID09PSBub2RlXG4gICAgICApXG4gICAgICBpZiAocmV1c2FibGVOb2RlSW5kZXggPiAtMSkge1xuICAgICAgICBjb25zdCByZXVzYWJsZU5vZGUgPSBjdXJyZW50VGV4dE5vZGVzTWFwcGFibGVUb05ld1N0cmluZ3Muc3BsaWNlKHJldXNhYmxlTm9kZUluZGV4LCAxKVswXVxuICAgICAgICByZXR1cm4gcmV1c2FibGVOb2RlXG4gICAgICB9XG4gICAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUobm9kZSlcbiAgICB9KVxuXG4gICAgLy8gUmVtb3ZlIHRoZSBub2RlcyB0aGF0IGFyZSBubyBsb25nZXIgaW4gdGhlIGlucHV0XG4gICAgZm9yIChjb25zdCBub2RlIG9mIGN1cnJlbnROb2Rlcykge1xuICAgICAgaWYgKCFub3JtYWxpemVkTm9kZXMuaW5jbHVkZXMobm9kZSkpIHtcbiAgICAgICAgdGhpcy5ub2Rlcy5yZW1vdmVOb2RlKG5vZGUpXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVvcmRlciBwcmVzZXJ2ZWQgbm9kZXNcbiAgICBjb25zdCBmaXJzdFByZXNlcnZlZE5vZGUgPSBjdXJyZW50Tm9kZXMuZmluZChub2RlID0+IG5vcm1hbGl6ZWROb2Rlcy5pbmNsdWRlcyhub2RlKSlcbiAgICBpZiAoZmlyc3RQcmVzZXJ2ZWROb2RlKSB7XG4gICAgICBsZXQgY3VycmVudE5vZGU6IE5vZGUgfCBudWxsID0gZmlyc3RQcmVzZXJ2ZWROb2RlXG4gICAgICBmb3IgKGNvbnN0IG5vZGUgb2Ygbm9ybWFsaXplZE5vZGVzKSB7XG4gICAgICAgIGlmIChjdXJyZW50Tm9kZXMuaW5jbHVkZXMobm9kZSkpIHtcbiAgICAgICAgICBpZiAobm9kZSAhPT0gY3VycmVudE5vZGUpIHtcbiAgICAgICAgICAgIHRoaXMubm9kZXMuaW5zZXJ0QmVmb3JlKG5vZGUsIGN1cnJlbnROb2RlKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjdXJyZW50Tm9kZSA9IGN1cnJlbnROb2RlLm5leHRTaWJsaW5nXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gSW5zZXJ0IG5ldyBub2Rlc1xuICAgIGxldCBpbnNlcnRCZWZvcmVOb2RlID0gZmlyc3RQcmVzZXJ2ZWROb2RlIHx8IG51bGxcbiAgICBmb3IgKGNvbnN0IG5vZGUgb2Ygbm9ybWFsaXplZE5vZGVzKSB7XG4gICAgICBpZiAobm9kZSAhPT0gaW5zZXJ0QmVmb3JlTm9kZSkge1xuICAgICAgICB0aGlzLm5vZGVzLmluc2VydEJlZm9yZShub2RlLCBpbnNlcnRCZWZvcmVOb2RlKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW5zZXJ0QmVmb3JlTm9kZSA9IGluc2VydEJlZm9yZU5vZGUgJiYgaW5zZXJ0QmVmb3JlTm9kZS5uZXh0U2libGluZ1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5jbGFzcyBOb2RlUmFuZ2VJbXBsIGltcGxlbWVudHMgTm9kZVJhbmdlIHtcbiAgW2luZGV4OiBudW1iZXJdOiBOb2RlIHwgdW5kZWZpbmVkO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcmVhZG9ubHkgc3RhcnRpbmdCb3VuZGFyeTogQ29tbWVudCxcbiAgICBwcml2YXRlIHJlYWRvbmx5IGVuZGluZ0JvdW5kYXJ5OiBDb21tZW50LFxuICApIHtcbiAgICByZXR1cm4gbmV3IFByb3h5KHRoaXMsIHtcbiAgICAgIGhhcyh0YXJnZXQ6IE5vZGVSYW5nZUltcGwsIHByb3BlcnR5S2V5OiBzdHJpbmcgfCBudW1iZXIgfCBzeW1ib2wpOiBib29sZWFuIHtcbiAgICAgICAgaWYgKHR5cGVvZiBwcm9wZXJ0eUtleSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICByZXR1cm4gISF0YXJnZXQuaXRlbShwcm9wZXJ0eUtleSlcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gUmVmbGVjdC5oYXModGFyZ2V0LCBwcm9wZXJ0eUtleSlcbiAgICAgIH0sXG4gICAgICBnZXQodGFyZ2V0OiBOb2RlUmFuZ2VJbXBsLCBwcm9wZXJ0eUtleTogc3RyaW5nIHwgbnVtYmVyIHwgc3ltYm9sKTogYW55IHtcbiAgICAgICAgaWYgKHR5cGVvZiBwcm9wZXJ0eUtleSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICByZXR1cm4gdGFyZ2V0Lml0ZW0ocHJvcGVydHlLZXkpIHx8IHVuZGVmaW5lZFxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0YXJnZXRbcHJvcGVydHlLZXkgYXMgYW55XVxuICAgICAgfSxcbiAgICAgIHNldCh0YXJnZXQ6IE5vZGVSYW5nZUltcGwsIHByb3BlcnR5S2V5OiBzdHJpbmcgfCBudW1iZXIgfCBzeW1ib2wsIHZhbHVlOiBhbnksIHJlY2VpdmVyOiBhbnkpOiBib29sZWFuIHtcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgJiYgISh2YWx1ZSBpbnN0YW5jZW9mIE5vZGUpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihgT25seSBzdHJpbmdzIGFuZCBET00gTm9kZXMgY2FuIGJlIHNldCB0byBpbmRleGVzIG9mIGEgTm9kZVJhbmdlLCAke3ZhbHVlfSB3YXMgcHJvdmlkZWRgKVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IG5vcm1hbGl6ZWRWYWx1ZSA9IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSh2YWx1ZSkgOiB2YWx1ZVxuXG4gICAgICAgIGlmICh0eXBlb2YgcHJvcGVydHlLZXkgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgY29uc3Qgbm9kZSA9IHRhcmdldC5pdGVtKHByb3BlcnR5S2V5KVxuICAgICAgICAgIGlmIChub2RlKSB7XG4gICAgICAgICAgICB0YXJnZXQucmVwbGFjZU5vZGUobm9ybWFsaXplZFZhbHVlLCBub2RlKVxuICAgICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocHJvcGVydHlLZXkgPT09IHRhcmdldC5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRhcmdldC5hcHBlbmROb2RlKG5vcm1hbGl6ZWRWYWx1ZSlcbiAgICAgICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gUmVmbGVjdC5zZXQodGFyZ2V0LCBwcm9wZXJ0eUtleSwgdmFsdWUsIHJlY2VpdmVyKVxuICAgICAgfSxcbiAgICAgIGRlbGV0ZVByb3BlcnR5KHRhcmdldDogTm9kZVJhbmdlSW1wbCwgcHJvcGVydHlLZXk6IHN0cmluZyB8IG51bWJlciB8IHN5bWJvbCk6IGJvb2xlYW4ge1xuICAgICAgICBpZiAodHlwZW9mIHByb3BlcnR5S2V5ID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIGNvbnN0IG5vZGUgPSB0YXJnZXQuaXRlbShwcm9wZXJ0eUtleSlcbiAgICAgICAgICBpZiAobm9kZSkge1xuICAgICAgICAgICAgdGFyZ2V0LnJlbW92ZU5vZGUobm9kZSlcbiAgICAgICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBSZWZsZWN0LmRlbGV0ZVByb3BlcnR5KHRhcmdldCwgcHJvcGVydHlLZXkpXG4gICAgICB9LFxuICAgICAgb3duS2V5cyh0YXJnZXQ6IE5vZGVSYW5nZUltcGwpOiBQcm9wZXJ0eUtleVtdIHtcbiAgICAgICAgY29uc3Qga2V5cyA9IFJlZmxlY3Qub3duS2V5cyh0YXJnZXQpXG4gICAgICAgIGNvbnN0IHtsZW5ndGh9ID0gdGFyZ2V0XG4gICAgICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgICBrZXlzLnB1c2goaW5kZXgpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGtleXNcbiAgICAgIH0sXG4gICAgfSlcbiAgfVxuXG4gIHB1YmxpYyBnZXQgcGFyZW50Tm9kZSgpOiBOb2RlIHtcbiAgICBjb25zdCBwYXJlbnROb2RlID0gdGhpcy5zdGFydGluZ0JvdW5kYXJ5LnBhcmVudE5vZGVcbiAgICBpZiAoIXBhcmVudE5vZGUpIHtcbiAgICAgIC8vIFRoaXMgc2hvdWxkIChtaWdodD8pIGJlIHByZXZlbnRhYmxlIGluIGEgbmF0aXZlIGltcGxlbWVudGF0aW9uIHNpbmNlIGl0IG1pZ2h0IG5vdCBoYXZlIHRvIHJlbHkgb24gYm91bmRhcnlcbiAgICAgIC8vIG5vZGVzLlxuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAnVGhlIGJvdW5kYXJ5IG5vZGVzIHVzZWQgYnkgdGhpcyBwb2x5ZmlsbCBubyBsb25nZXIgaGF2ZSBhIHBhcmVudCBub2RlIGJlY2F1c2UgdGhleSB3ZXJlIHJlbW92ZWQgZnJvbSBpdCBieSAnICtcbiAgICAgICAgJ2EgdGhpcmQgcGFydHkuIFRoZXJlZm9yZSwgdGhlIHBhcmVudCBub2RlIG9mIHRoaXMgbm9kZSByYW5nZSBjYW5ub3QgYmUgbG9jYXRlZC4nLFxuICAgICAgKVxuICAgIH1cbiAgICByZXR1cm4gcGFyZW50Tm9kZVxuICB9XG5cbiAgcHVibGljIGdldCBsZW5ndGgoKTogbnVtYmVyIHtcbiAgICBsZXQgY291bnRlZE5vZGUgPSB0aGlzLnN0YXJ0aW5nQm91bmRhcnkubmV4dFNpYmxpbmdcbiAgICBsZXQgY291bnQgPSAwXG4gICAgd2hpbGUgKGNvdW50ZWROb2RlICYmIGNvdW50ZWROb2RlICE9PSB0aGlzLmVuZGluZ0JvdW5kYXJ5KSB7XG4gICAgICBjb3VudCsrXG4gICAgICBjb3VudGVkTm9kZSA9IGNvdW50ZWROb2RlLm5leHRTaWJsaW5nXG4gICAgfVxuICAgIHJldHVybiBjb3VudFxuICB9XG5cbiAgcHVibGljIGl0ZW0oaW5kZXg6IG51bWJlcik6IE5vZGUgfCBudWxsIHtcbiAgICBpZiAoaW5kZXggPCAwKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIGxldCBub2RlID0gdGhpcy5zdGFydGluZ0JvdW5kYXJ5Lm5leHRTaWJsaW5nXG4gICAgd2hpbGUgKGluZGV4LS0pIHtcbiAgICAgIGlmICghbm9kZSB8fCBub2RlID09PSB0aGlzLmVuZGluZ0JvdW5kYXJ5KSB7XG4gICAgICAgIHJldHVybiBudWxsXG4gICAgICB9XG4gICAgICBub2RlID0gbm9kZS5uZXh0U2libGluZ1xuICAgIH1cbiAgICByZXR1cm4gbm9kZVxuICB9XG5cbiAgcHVibGljIHJlcGxhY2VOb2RlKG5ld05vZGU6IE5vZGUsIG9sZE5vZGU6IE5vZGUpOiB2b2lkIHtcbiAgICB0aGlzLnBhcmVudE5vZGUucmVwbGFjZUNoaWxkKG5ld05vZGUsIG9sZE5vZGUpXG4gIH1cblxuICBwdWJsaWMgaW5zZXJ0QmVmb3JlKG5ld05vZGU6IE5vZGUsIHJlZk5vZGU6IE5vZGUgfCBudWxsKTogdm9pZCB7XG4gICAgdGhpcy5wYXJlbnROb2RlLmluc2VydEJlZm9yZShuZXdOb2RlLCByZWZOb2RlIHx8IHRoaXMuZW5kaW5nQm91bmRhcnkpXG4gIH1cblxuICBwdWJsaWMgYXBwZW5kTm9kZShub2RlOiBOb2RlKTogdm9pZCB7XG4gICAgdGhpcy5wYXJlbnROb2RlLmluc2VydEJlZm9yZShub2RlLCB0aGlzLmVuZGluZ0JvdW5kYXJ5KVxuICB9XG5cbiAgcHVibGljIHJlbW92ZU5vZGUobm9kZTogTm9kZSk6IHZvaWQge1xuICAgIHRoaXMucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChub2RlKVxuICB9XG5cbiAgcHVibGljIGtleXMoKTogSXRlcmFibGVJdGVyYXRvcjxudW1iZXI+IHtcbiAgICBjb25zdCBub2RlUmFuZ2UgPSB0aGlzXG4gICAgcmV0dXJuIGZ1bmN0aW9uKigpOiBJdGVyYWJsZUl0ZXJhdG9yPG51bWJlcj4ge1xuICAgICAgZm9yIChjb25zdCBba2V5XSBvZiBub2RlUmFuZ2UuZW50cmllcygpKSB7XG4gICAgICAgIHlpZWxkIGtleVxuICAgICAgfVxuICAgIH0oKVxuICB9XG5cbiAgcHVibGljIHZhbHVlcygpOiBJdGVyYWJsZUl0ZXJhdG9yPE5vZGU+IHtcbiAgICBjb25zdCBub2RlUmFuZ2UgPSB0aGlzXG4gICAgcmV0dXJuIGZ1bmN0aW9uKigpOiBJdGVyYWJsZUl0ZXJhdG9yPE5vZGU+IHtcbiAgICAgIGZvciAoY29uc3QgWywgbm9kZV0gb2Ygbm9kZVJhbmdlLmVudHJpZXMoKSkge1xuICAgICAgICB5aWVsZCBub2RlXG4gICAgICB9XG4gICAgfSgpXG4gIH1cblxuICBwdWJsaWMgZW50cmllcygpOiBJdGVyYWJsZUl0ZXJhdG9yPFtudW1iZXIsIE5vZGVdPiB7XG4gICAgbGV0IG5vZGUgPSB0aGlzLnN0YXJ0aW5nQm91bmRhcnkubmV4dFNpYmxpbmdcbiAgICBjb25zdCBlbmQgPSB0aGlzLmVuZGluZ0JvdW5kYXJ5XG4gICAgcmV0dXJuIGZ1bmN0aW9uKigpOiBJdGVyYWJsZUl0ZXJhdG9yPFtudW1iZXIsIE5vZGVdPiB7XG4gICAgICBsZXQga2V5ID0gMFxuICAgICAgd2hpbGUgKG5vZGUgJiYgbm9kZSAhPT0gZW5kKSB7XG4gICAgICAgIHlpZWxkIFtrZXksIG5vZGVdXG4gICAgICAgIG5vZGUgPSBub2RlLm5leHRTaWJsaW5nXG4gICAgICAgIGtleSsrXG4gICAgICB9XG4gICAgfSgpXG4gIH1cblxuICBwdWJsaWMgZm9yRWFjaDxUPihcbiAgICBjYWxsYmFjazogKHRoaXM6IFQsIHZhbHVlOiBOb2RlLCBpbmRleDogbnVtYmVyLCBsaXN0OiBOb2RlUmFuZ2UpID0+IHZvaWQsXG4gICAgdGhpc1ZhbHVlPzogVCxcbiAgKTogdm9pZCB7XG4gICAgZm9yIChjb25zdCBbaW5kZXgsIG5vZGVdIG9mIHRoaXMuZW50cmllcygpKSB7XG4gICAgICBjYWxsYmFjay5jYWxsKHRoaXNWYWx1ZSBhcyBULCBub2RlLCBpbmRleCwgdGhpcylcbiAgICB9XG4gIH1cblxuICBwdWJsaWMgW1N5bWJvbC5pdGVyYXRvcl0oKTogSXRlcmFibGVJdGVyYXRvcjxOb2RlPiB7XG4gICAgcmV0dXJuIHRoaXMudmFsdWVzKClcbiAgfVxufVxuXG5jbGFzcyBMaXZlUm9vdE5vZGVMaXN0SW1wbCBpbXBsZW1lbnRzIE5vZGVMaXN0IHtcbiAgLy8gSW1wbGVtZW50YXRpb24gbm90ZTogYSBcInJlYWxcIiBwb2x5ZmlsbCAob3IgYSBuYXRpdmUgaW1wbGVtZW50YXRpb24pIHdvdWxkIGhvb2sgaW50b1xuICAvLyBOb2RlLnByb3RvdHlwZS57YXBwZW5kLGFwcGVuZENoaWxkLGluc2VydEJlZm9yZSwuLi59IHRvIGtlZXAgdHJhY2sgb2YgYWxsIG5vZGVzIHRoYXQgZ290IGluc2VydGVkIGJ5IGEgM3JkIHBhcnR5XG4gIC8vIGFmdGVyIHRoZSBmaXJzdCBub2RlIGFuZCBiZWZvcmUgdGhlIGxhc3QsIGFzIHdlbGwgYXMgb3RoZXIgbW9kaWZpY2F0aW9ucyB0byB0aGUgc2VxdWVuY2Ugb2Ygbm9kZXMgdHJhY2tlZCBieSB0aGlzXG4gIC8vIE5vZGVMaXN0LlxuICAvLyBTaW5jZSB0aGUgRHluYW1pY0RvY3VtZW50RnJhZ21lbnQucHJvdG90eXBlLnJvb3ROb2RlcyBpcyB1c2VkIHRvIGtlZXAgdHJhY2sgb2YgdGhlIG5vZGVzIGF0IHRoZSByb290IG9mIHRoZSBnaXZlblxuICAvLyBkeW5hbWljIGRvY3VtZW50IGZyYWdtZW50IHRvIGVuYWJsZSB0ZW1wbGF0ZSBjb21wb3NpdGlvbiwgZXZlbnQgYWZ0ZXIgaXQgaGFzIGJlZW4gYWRkZWQgdG8gYSBOb2RlJ3MgY2hpbGROb2Rlc1xuICAvLyAoZWl0aGVyIHZpYSBhcHBlbmRDaGlsZCBvciB1c2luZyBzb21lIG90aGVyIG1ldGhvZCksIGl0IGlzIG5lY2Vzc2FyeSB0byBhbHNvIGNvcnJlY3RseSBoYW5kbGUgYW55IG1vZGlmaWNhdGlvbnMgdG9cbiAgLy8gdGhlIHRyYWNrZWQgc2VxdWVuY2Ugb2Ygbm9kZXMsIGFzc3VtaW5nIHRoYXQgYWxsIG1vZGlmaWNhdGlvbnMgYXJlIGRlc2lyZWQuXG4gIC8vIFRoZSBub2RlIGxpc3QgaXMgbWVhbnQgdG8gYmUgbGl2ZSwgcmVhY3RpbmcgdG8gdGhlIGZvbGxvd2luZyBvcGVyYXRpb25zIGFzIGRlc2NyaWJlZCBiZWxvdzpcbiAgLy8gKiBJbnNlcnRpbmcgYSBub2RlIGFmdGVyIHRoZSBmaXJzdCBub2RlIG9mIHRoaXMgbm9kZSBsaXN0IGJ1dCBiZWZvcmUgdGhlIGxhc3Qgbm9kZSBvZiB0aGlzIG5vZGUgbGlzdCAtIHRoZSBpbnNlcnRlZFxuICAvLyAgIG5vZGUgYmVjb21lcyBhIHBhcnQgb2YgdGhlIG5vZGUgbGlzdC5cbiAgLy8gKiBNb3ZpbmcgYSB0cmFja2VkIG5vZGUgdG8gYSBkaWZmZXJlbnQgcG9zaXRpb24gaW4gdGhlIHNlcXVlbmNlLCBpbmNsdWRpbmcgcmlnaHQgYmVmb3JlIHRoZSBjdXJyZW50IGZpcnN0IG5vZGUgb3JcbiAgLy8gICByaWdodCBhZnRlciB0aGUgbGFzdCBub2RlIG9mIHRoZSB0cmFja2VkIG5vZGVzIC0gdGhpcyB1cGRhdGVzIHRoZSBvcmRlciBvZiB0aGUgdHJhY2tlZCBub2Rlc1xuICAvLyAqIFJlbW92aW5nIGEgdHJhY2tlZCBub2RlIGZyb20gdGhlIHNlcXVlbmNlIC0gaGFzIG5vIGVmZmVjdCBvbiB0aGlzIG5vZGUgbGlzdC4gVGhpcyBlbmFibGVzIHRlbXBvcmFyeSByZW1vdmFsIG9mXG4gIC8vICAgcGFydHMgb2YgVUkuIEluc2VydGluZyB0aGUgbm9kZSB0byBET00gYWZ0ZXJ3YXJkcyB3aWxsIGhhdmUgYW4gZWZmZWN0IGRlcGVuZGluZyBvbiB3aGVyZSB0aGUgbm9kZSBpcyBpbnNlcnRlZC5cbiAgLy8gKiBNb3ZlIGEgdHJhY2tlZCBub2RlIHRvIGEgZGlmZmVyZW50IHBvc2l0aW9uIG91dHNpZGUgdGhlIHNlcXVlbmNlLCBpbmNsdWRpbmcgdG8gYSBoaWdoZXIgb3IgbG93ZXIgcG9pbnQgaW4gbm9kZVxuICAvLyAgIGhpZXJhcmNoeSAtIHJlbW92ZXMgdGhlIG5vZGUgZnJvbSB0aGUgdHJhY2tlZCBub2Rlcy4gQW55IGR5bmFtaWMgdGVtcGxhdGUgcGFydCByZWZlcmVuY2luZyB0aGUgbm9kZSBvciBhbnkgb2YgaXRzXG4gIC8vICAgZGVzY2VuZGFudHMgYmVjb21lIGluYWN0aXZlLlxuICAvL1xuICAvLyBUaGUgaW1wbGVtZW50YXRpb24gYmVsb3cgaXMgbGFyZ2VseSBzaW1wbGlmaWVkIGFuZCBkb2VzIG5vdCBpbXBsZW1lbnQgdGhlIGJlaGF2aW9yIGRlc2NyaWJlZCBhYm92ZSwgaXQgb25seSBzZXJ2ZXNcbiAgLy8gdG8gZGVtb25zdHJhdGUgdGhpcyBjb25jZXB0IGFuZCBlbmFibGUgYmFzaWMgZXhwZXJpbWVudGF0aW9uLlxuXG4gIFtpbmRleDogbnVtYmVyXTogTm9kZVxuXG4gIHByaXZhdGUgcmVhZG9ubHkgdHJhY2tlZE5vZGVzOiBOb2RlW11cblxuICBjb25zdHJ1Y3Rvcihub2Rlc0NvbnRhaW5lcjogRG9jdW1lbnRGcmFnbWVudCkge1xuICAgIHRoaXMudHJhY2tlZE5vZGVzID0gWy4uLm5vZGVzQ29udGFpbmVyLmNoaWxkTm9kZXNdXG5cbiAgICByZXR1cm4gbmV3IFByb3h5KHRoaXMsIHtcbiAgICAgIGhhcyh0YXJnZXQ6IExpdmVSb290Tm9kZUxpc3RJbXBsLCBwcm9wZXJ0eUtleTogc3RyaW5nIHwgbnVtYmVyIHwgc3ltYm9sKTogYm9vbGVhbiB7XG4gICAgICAgIGlmICh0eXBlb2YgcHJvcGVydHlLZXkgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgcmV0dXJuICEhdGFyZ2V0Lml0ZW0ocHJvcGVydHlLZXkpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFJlZmxlY3QuaGFzKHRhcmdldCwgcHJvcGVydHlLZXkpXG4gICAgICB9LFxuICAgICAgZ2V0KHRhcmdldDogTGl2ZVJvb3ROb2RlTGlzdEltcGwsIHByb3BlcnR5S2V5OiBzdHJpbmcgfCBudW1iZXIgfCBzeW1ib2wpOiBhbnkge1xuICAgICAgICBpZiAodHlwZW9mIHByb3BlcnR5S2V5ID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIHJldHVybiB0YXJnZXQuaXRlbShwcm9wZXJ0eUtleSkgfHwgdW5kZWZpbmVkXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRhcmdldFtwcm9wZXJ0eUtleSBhcyBhbnldXG4gICAgICB9LFxuICAgICAgb3duS2V5cyh0YXJnZXQ6IExpdmVSb290Tm9kZUxpc3RJbXBsKTogUHJvcGVydHlLZXlbXSB7XG4gICAgICAgIGNvbnN0IGtleXMgPSBSZWZsZWN0Lm93bktleXModGFyZ2V0KVxuICAgICAgICBjb25zdCB7bGVuZ3RofSA9IHRhcmdldFxuICAgICAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICAgICAga2V5cy5wdXNoKGluZGV4KVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBrZXlzXG4gICAgICB9LFxuICAgIH0pXG4gIH1cblxuICBwdWJsaWMgZ2V0IGxlbmd0aCgpOiBudW1iZXIge1xuICAgIGxldCBsZW5ndGggPSAwXG4gICAgZm9yIChjb25zdCBfIG9mIHRoaXMuZW50cmllcygpKSB7XG4gICAgICBsZW5ndGgrK1xuICAgIH1cbiAgICByZXR1cm4gbGVuZ3RoXG4gIH1cblxuICBwdWJsaWMgaXRlbShpbmRleDogbnVtYmVyKTogTm9kZSB8IG51bGwge1xuICAgIGxldCBjdXJyZW50SW5kZXggPSAwXG4gICAgZm9yIChjb25zdCBub2RlIG9mIHRoaXMudmFsdWVzKCkpIHtcbiAgICAgIGlmIChjdXJyZW50SW5kZXggPT09IGluZGV4KSB7XG4gICAgICAgIHJldHVybiBub2RlXG4gICAgICB9XG4gICAgICBjdXJyZW50SW5kZXgrK1xuICAgIH1cblxuICAgIHJldHVybiBudWxsXG4gIH1cblxuICBwdWJsaWMgZW50cmllcygpOiBJdGVyYWJsZUl0ZXJhdG9yPFtudW1iZXIsIE5vZGVdPiB7XG4gICAgcmV0dXJuIHRoaXMudHJhY2tlZE5vZGVzLmVudHJpZXMoKVxuICB9XG5cbiAgcHVibGljIGtleXMoKTogSXRlcmFibGVJdGVyYXRvcjxudW1iZXI+IHtcbiAgICBjb25zdCBub2RlTGlzdCA9IHRoaXNcbiAgICByZXR1cm4gZnVuY3Rpb24qKCk6IEl0ZXJhYmxlSXRlcmF0b3I8bnVtYmVyPiB7XG4gICAgICBmb3IgKGNvbnN0IFtrZXldIG9mIG5vZGVMaXN0LmVudHJpZXMoKSkge1xuICAgICAgICB5aWVsZCBrZXlcbiAgICAgIH1cbiAgICB9KClcbiAgfVxuXG4gIHB1YmxpYyB2YWx1ZXMoKTogSXRlcmFibGVJdGVyYXRvcjxOb2RlPiB7XG4gICAgY29uc3Qgbm9kZUxpc3QgPSB0aGlzXG4gICAgcmV0dXJuIGZ1bmN0aW9uKigpOiBJdGVyYWJsZUl0ZXJhdG9yPE5vZGU+IHtcbiAgICAgIGZvciAoY29uc3QgWywgbm9kZV0gb2Ygbm9kZUxpc3QuZW50cmllcygpKSB7XG4gICAgICAgIHlpZWxkIG5vZGVcbiAgICAgIH1cbiAgICB9KClcbiAgfVxuXG4gIHB1YmxpYyBmb3JFYWNoPFQ+KFxuICAgIGNhbGxiYWNrOiAodGhpczogVCwgdmFsdWU6IE5vZGUsIGluZGV4OiBudW1iZXIsIGxpc3Q6IE5vZGVMaXN0KSA9PiB2b2lkLFxuICAgIHRoaXNWYWx1ZT86IFQsXG4gICk6IHZvaWQge1xuICAgIGZvciAoY29uc3QgW2luZGV4LCBub2RlXSBvZiB0aGlzLmVudHJpZXMoKSkge1xuICAgICAgY2FsbGJhY2suY2FsbCh0aGlzVmFsdWUgYXMgVCwgbm9kZSwgaW5kZXgsIHRoaXMpXG4gICAgfVxuICB9XG5cbiAgcHVibGljIFtTeW1ib2wuaXRlcmF0b3JdKCk6IEl0ZXJhYmxlSXRlcmF0b3I8Tm9kZT4ge1xuICAgIHJldHVybiB0aGlzLnZhbHVlcygpXG4gIH1cbn1cbiJdfQ==