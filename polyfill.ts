document.createDynamicTemplate = (...htmlFragments: readonly string[]): DynamicDocumentTemplate => {
  // A "real" polyfill or native implementation would not need to inject any helper attributes or elements, as it can
  // just keep track of which nodes and places in child nodes will be dynamic, and store that information in a separate
  // object. I assume that, to implement such behavior, a polyfill would need to parse the HTML code the same way a
  // browser's HTML parser would (i.e. handle malformed HTML or incorrect element nesting correctly).
  // Also, a native implementation (or a more advanced polyfill) can provide a more reliable SVG support. All that's
  // needed for that is to hook into Node.prototype.{append,appendChild,insertBefore,...} and check whether the dynamic
  // template is being injected into an SVG context or HTML context. However, as the code below demonstrates, in many
  // situations it can be determined from the provided markup itself whether it's SVG or HTML code.

  if (!htmlFragments.length || (htmlFragments.length === 1 && !htmlFragments)) {
    throw new Error('At least one html fragment must be provided, and the fragment must not be an empty string')
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
    ]
    // Element names shared by SVG and HTML
    const SHARED_ELEMENTS = ['a', 'font', 'image', 'script', 'style', 'title']

    const completeMarkup = htmlFragments.join('')
    const firstElementStart = completeMarkup.indexOf('<')
    if (firstElementStart === -1) {
      return false
    }

    const firstElementName = completeMarkup.slice(firstElementStart + 1).match(/^\s*([^\s:=/>]+)/)?.[1]
    if (!firstElementName) {
      throw new Error(`Invalid markup - missing element name at position ${firstElementStart}: ${completeMarkup}`)
    }

    if (SVG_ONLY_ELEMENTS.includes(firstElementName)) {
      return true
    }
    if (!SHARED_ELEMENTS.includes(firstElementName)) {
      return false
    }

    try {
      const parser = new DOMParser()
      // An SVG markup must be a well-formed XML
      const parsedMarkup = parser.parseFromString(completeMarkup, 'text/xml')
      const caseInsensitiveParsedMarkup = parser.parseFromString(completeMarkup, 'text/html')
      if (caseInsensitiveParsedMarkup.querySelector('svg')) {
        return false
      }

      // Let's call this an educated guess that works reliably enough
      return !!parsedMarkup.querySelector(`[${SVG_ONLY_ELEMENTS}]`)
    } catch (parsingError) {
      return false
    }
  })()

  const currentDynamicAttributes: string[] = []
  let isInsideElement = false
  let isInsideComment = false
  const processedFragments = htmlFragments.map((fragment, fragmentIndex, {length: fragmentCount}) => {
    let currentPosition = 0
    do {
      if (isInsideComment) {
        currentPosition = fragment.indexOf('-->', currentPosition)
        if (currentPosition === -1) {
          throw new Error(
            `The ${fragmentIndex}. fragment contains an unterminated comment. Dynamic comments are not supported by ` +
            `this polyfill.`,
          )
        }
        currentPosition += 4
        isInsideComment = false
      } else if (isInsideElement) {
        const elementEnd = fragment.indexOf('>', currentPosition)
        if (elementEnd === -1) { // Dynamic attribute or element
          const valueSeparator = fragment.lastIndexOf('=')
          if (valueSeparator === -1) {
            currentDynamicAttributes.push('')
          } else {
            if (/^\s*(?:"[^"]*"|'[^']*'|[^\s"']*(?:\s|$))/.test(fragment.slice(valueSeparator + 1))) {
              // The last attribute before this fragment's end is already fully-formed
              currentDynamicAttributes.push('')
            } else {
              let attributeNameEnd = valueSeparator - 1
              while (/\s/.test(fragment.charAt(attributeNameEnd))) {
                attributeNameEnd--
              }
              let attributeNameStart = attributeNameEnd
              while (attributeNameStart && /\S/.test(fragment.charAt(attributeNameStart - 1))) {
                attributeNameStart--
              }
              const attributeName = fragment.slice(attributeNameStart, attributeNameEnd + 1)
              currentDynamicAttributes.push(attributeName)
            }
          }
          currentPosition = -1
        } else {
          // Skip attributes of the current element up to the position of potential element end
          while (true) {
            const nextAttributeValueDelimiterIndex = fragment.slice(0, elementEnd).indexOf('=', currentPosition)
            if (nextAttributeValueDelimiterIndex === -1) {
              break
            }
            currentPosition = nextAttributeValueDelimiterIndex + 1
            while (/\s/.test(fragment.charAt(currentPosition))) {
              currentPosition++
            }
            if (/["']/.test(fragment.charAt(currentPosition))) {
              const valueDelimiter = fragment.charAt(currentPosition)
              currentPosition = fragment.indexOf(valueDelimiter, currentPosition) + 1
            } else {
              while (/[^\s>]/.test(fragment.charAt(currentPosition))) {
                currentPosition++
              }
            }
          }
          if (currentPosition > elementEnd) {
            // This was a false positive, the ">" character was inside an attribute's value
          } else {
            isInsideElement = false
            if (currentDynamicAttributes.length) {
              const dynamicAttributesNote = ` data-dtpp-attributes="${currentDynamicAttributes.splice(0).join(';')}"`
              fragment = fragment.slice(0, elementEnd) + dynamicAttributesNote + fragment.slice(elementEnd)
              currentPosition = elementEnd + dynamicAttributesNote.length + 1
            } else {
              currentPosition = elementEnd + 1
            }
          }
        }
      } else {
        currentPosition = fragment.indexOf('<', currentPosition)
        if (currentPosition > -1) {
          if (fragment.startsWith('<!--', currentPosition)) {
            isInsideComment = true
            currentPosition += 4
          } else {
            isInsideElement = true
            do {
              currentPosition++
            } while (/\s/.test(fragment.charAt(currentPosition)))
            while (/[^\s:=/>]/.test(fragment.charAt(currentPosition))) {
              currentPosition++
            }
            while (/\s/.test(fragment.charAt(currentPosition))) {
              currentPosition++
            }
          }
        } else if (fragmentIndex < fragmentCount - 1) {
          const markerElement = isSvg ? 'g' : 'span'
          fragment += `<${markerElement} data-dtpp-nodes=""></${markerElement}>`
        }
      }
    } while (currentPosition > -1)
    return fragment
  })

  const template = document.createElement('template')
  template.innerHTML = isSvg ? `<svg>${processedFragments.join('')}</svg>` : processedFragments.join('')
  if (isSvg) {
    const svgRoot = template.content.firstElementChild!
    while (svgRoot.firstChild) {
      template.content.insertBefore(svgRoot.firstChild, svgRoot)
    }
    template.content.removeChild(svgRoot)
  }

  return new DynamicDocumentTemplateImpl(template.content)
}

class DynamicDocumentTemplateImpl implements DynamicDocumentTemplate {
  constructor(
    private readonly parsedTemplate: DocumentFragment,
  ) {
  }

  instantiate<A>(processor?: DynamicTemplateProcessor<A>, processorArguments?: A): DynamicDocumentFragment<A> {
    const instanceFragment = this.parsedTemplate.cloneNode(true) as DocumentFragment
    const placesWithDynamicParts = instanceFragment.querySelectorAll(
      '[data-dtpp-attributes],[data-dtpp-nodes]',
    )
    const parts: DynamicTemplatePart[] = []
    for (let i = 0, {length} = placesWithDynamicParts; i < length; i++) {
      const place = placesWithDynamicParts[i]
      if (place.hasAttribute('data-dtpp-attributes')) {
        const attributes = place.getAttribute('data-dtpp-attributes')!
        const partsForAttributes = new Map<string, DynamicTemplatePart>() // Used for deduplication
        for (const attribute of attributes.split(';')) {
          const part = partsForAttributes.get(attribute) || (attribute ?
            new DynamicTemplateAttributePartImpl(place, place.getAttributeNode(attribute)!)
          :
            new DynamicTemplateElementPartImpl(place)
          )
          partsForAttributes.set(attribute, part)
          parts.push(part)
        }
        place.removeAttribute('data-dtpp-attributes')
      }
      if (place.hasAttribute('data-dtpp-nodes')) {
        const start = document.createComment('')
        const end = document.createComment('')
        place.parentNode!.replaceChild(end, place)
        end.parentNode!.insertBefore(start, end)
        const nodeRange = new NodeRangeImpl(end.parentNode!, start, end)
        parts.push(new DynamicTemplateNodeRangePartImpl(
          end.parentNode as Element | DynamicDocumentFragment<A>,
          nodeRange,
        ))
      }
    }

    const instance = Object.assign(instanceFragment, {
      processor: processor || null,
      parts: new DynamicTemplatePartListImpl(parts),
      rootNodes: new LiveRootNodeListImpl(instanceFragment.firstChild!, instanceFragment.lastChild!),
    })
    if (processor) {
      processor(instance, processorArguments)
    }

    return instance
  }
}

class DynamicTemplatePartListImpl implements DynamicTemplatePartList {
  public readonly length: number
  readonly [index: number]: DynamicTemplatePart | undefined

  constructor(
    private readonly parts: readonly DynamicTemplatePart[],
  ) {
    Object.assign(this, parts)
    this.length = parts.length
  }

  public item(index: number): DynamicTemplatePart | null {
    return this[index] || null
  }

  public keys(): IterableIterator<number> {
    return this.parts.keys()
  }

  public values(): IterableIterator<DynamicTemplatePart> {
    return this.parts.values()
  }

  public entries(): IterableIterator<[number, DynamicTemplatePart]> {
    return this.parts.entries()
  }

  public forEach<T>(
    callback: (this: T, value: DynamicTemplatePart, index: number, list: DynamicTemplatePartList) => void,
    thisValue?: T,
  ): void {
    this.parts.forEach((value, index) => {
      callback.call(thisValue as T, value, index, this)
    })
  }

  public [Symbol.iterator](): Iterator<DynamicTemplatePart> {
    return this.parts[Symbol.iterator]()
  }
}

abstract class AbstractDynamicTemplatePart<P extends PartType> implements DynamicTemplatePart {
  public readonly ATTRIBUTE_PART: PartType.ATTRIBUTE_PART = PartType.ATTRIBUTE_PART
  public readonly ELEMENT_PART: PartType.ELEMENT_PART = PartType.ELEMENT_PART
  public readonly NODE_RANGE_PART: PartType.NODE_RANGE_PART = PartType.NODE_RANGE_PART
  public readonly COMMENT_PART: PartType.COMMENT_PART = PartType.COMMENT_PART

  protected constructor(
    public readonly partType: P,
  ) {
  }
}

class DynamicTemplateAttributePartImpl
  extends AbstractDynamicTemplatePart<PartType.ATTRIBUTE_PART>
  implements DynamicTemplateAttributePart
{
  public readonly attributeName = this.attribute.name

  constructor(
    public readonly element: Element,
    public readonly attribute: Attr,
  ) {
    super(PartType.ATTRIBUTE_PART);
  }

  public get value(): string | null {
    return this.attribute.value
  }

  public set value(value: string | null) {
    if (typeof value === 'string') {
      this.attribute.value = value
      this.element.setAttributeNode(this.attribute)
    } else if (this.element.hasAttribute(this.attribute.name)) {
      this.element.removeAttributeNode(this.attribute)
    }
  }
}

class DynamicTemplateElementPartImpl
  extends AbstractDynamicTemplatePart<PartType.ELEMENT_PART>
  implements DynamicTemplateElementPart
{
  constructor(
    public readonly element: Element,
  ) {
    super(PartType.ELEMENT_PART);
  }
}

class DynamicTemplateNodeRangePartImpl<PA>
  extends AbstractDynamicTemplatePart<PartType.NODE_RANGE_PART>
  implements DynamicTemplateNodeRangePart<PA>
{
  constructor(
    public readonly parentNode: Element | DynamicDocumentFragment<PA>,
    public readonly nodes: NodeRange,
  ) {
    super(PartType.NODE_RANGE_PART);
  }

  public replaceWith(...nodes: ReadonlyArray<string | Node>): void {
    const currentNodes: Node[] = [...this.nodes]

    // Normalize the input, allowing existing text nodes to be reused for matching strings in input
    const currentTextNodes = currentNodes.filter(node => node.nodeType === node.TEXT_NODE) as Text[]
    const currentTextNodesMappableToNewStrings = currentTextNodes.filter(textNode => !nodes.includes(textNode))
    const normalizedNodes: Node[] = nodes.map(node => {
      if (node instanceof Node) {
        return node
      }

      const reusableNodeIndex = currentTextNodesMappableToNewStrings.findIndex(
        textNode => textNode.nodeValue === node
      )
      if (reusableNodeIndex > -1) {
        const reusableNode = currentTextNodesMappableToNewStrings.splice(reusableNodeIndex, 1)[0]
        return reusableNode
      }
      return document.createTextNode(node)
    })

    // Remove the nodes that are no longer in the input
    for (const node of currentNodes) {
      if (!normalizedNodes.includes(node)) {
        this.nodes.removeNode(node)
      }
    }

    // Reorder preserved nodes
    const firstPreservedNode = currentNodes.find(node => normalizedNodes.includes(node))
    if (firstPreservedNode) {
      let currentNode: Node | null = firstPreservedNode
      for (const node of normalizedNodes) {
        if (currentNodes.includes(node)) {
          if (node !== currentNode) {
            this.nodes.insertBefore(node, currentNode)
          } else {
            currentNode = currentNode.nextSibling
          }
        }
      }
    }

    // Insert new nodes
    let insertBeforeNode = firstPreservedNode || null
    for (const node of normalizedNodes) {
      if (node !== insertBeforeNode) {
        this.nodes.insertBefore(node, insertBeforeNode)
      } else {
        insertBeforeNode = insertBeforeNode && insertBeforeNode.nextSibling
      }
    }
  }
}

class NodeRangeImpl implements NodeRange {
  [index: number]: Node | undefined;

  constructor(
    public readonly parentNode: Node,
    private readonly startingBoundary: Comment,
    private readonly endingBoundary: Comment,
  ) {
    return new Proxy(this, {
      has(target: NodeRangeImpl, propertyKey: string | number | symbol): boolean {
        if (typeof propertyKey === 'number') {
          return !!target.item(propertyKey)
        }
        return Reflect.has(target, propertyKey)
      },
      get(target: NodeRangeImpl, propertyKey: string | number | symbol): any {
        if (typeof propertyKey === 'number') {
          return target.item(propertyKey) || undefined
        }
        return target[propertyKey as any]
      },
      set(target: NodeRangeImpl, propertyKey: string | number | symbol, value: any, receiver: any): boolean {
        if (typeof value !== 'string' && !(value instanceof Node)) {
          throw new TypeError(`Only strings and DOM Nodes can be set to indexes of a NodeRange, ${value} was provided`)
        }
        const normalizedValue = typeof value === 'string' ? document.createTextNode(value) : value

        if (typeof propertyKey === 'number') {
          const node = target.item(propertyKey)
          if (node) {
            target.replaceNode(normalizedValue, node)
            return true
          }

          if (propertyKey === target.length) {
            target.appendNode(normalizedValue)
            return true
          }

          return false
        }

        return Reflect.set(target, propertyKey, value, receiver)
      },
      deleteProperty(target: NodeRangeImpl, propertyKey: string | number | symbol): boolean {
        if (typeof propertyKey === 'number') {
          const node = target.item(propertyKey)
          if (node) {
            target.removeNode(node)
            return true
          }
          return false
        }
        return Reflect.deleteProperty(target, propertyKey)
      },
      ownKeys(target: NodeRangeImpl): PropertyKey[] {
        const keys = Reflect.ownKeys(target)
        const {length} = target
        for (let index = 0; index < length; index++) {
          keys.push(index)
        }
        return keys
      },
    })
  }

  public get length(): number {
    let countedNode = this.startingBoundary.nextSibling
    let count = 0
    while (countedNode && countedNode !== this.endingBoundary) {
      count++
      countedNode = countedNode.nextSibling
    }
    return count
  }

  public item(index: number): Node | null {
    if (index < 0) {
      return null
    }

    let node = this.startingBoundary.nextSibling
    while (index--) {
      if (!node || node === this.endingBoundary) {
        return null
      }
      node = node.nextSibling
    }
    return node
  }

  public replaceNode(newNode: Node, oldNode: Node): void {
    this.parentNode.replaceChild(newNode, oldNode)
  }

  public insertBefore(newNode: Node, refNode: Node | null): void {
    this.parentNode.insertBefore(newNode, refNode || this.endingBoundary)
  }

  public appendNode(node: Node): void {
    this.parentNode.insertBefore(node, this.endingBoundary)
  }

  public removeNode(node: Node): void {
    this.parentNode.removeChild(node)
  }

  public keys(): IterableIterator<number> {
    const nodeRange = this
    return function*(): IterableIterator<number> {
      for (const [key] of nodeRange.entries()) {
        yield key
      }
    }()
  }

  public values(): IterableIterator<Node> {
    const nodeRange = this
    return function*(): IterableIterator<Node> {
      for (const [, node] of nodeRange.entries()) {
        yield node
      }
    }()
  }

  public entries(): IterableIterator<[number, Node]> {
    let node = this.startingBoundary.nextSibling
    const end = this.endingBoundary
    return function*(): IterableIterator<[number, Node]> {
      let key = 0
      while (node && node !== end) {
        yield [key, node]
        node = node.nextSibling
        key++
      }
    }()
  }

  public forEach<T>(
    callback: (this: T, value: Node, index: number, list: NodeRange) => void,
    thisValue?: T,
  ): void {
    for (const [index, node] of this.entries()) {
      callback.call(thisValue as T, node, index, this)
    }
  }

  public [Symbol.iterator](): IterableIterator<Node> {
    return this.values()
  }
}

class LiveRootNodeListImpl implements NodeList {
  [index: number]: Node

  constructor(
    private readonly firstNode: Node,
    private readonly lastNode: Node,
  ) {
    return new Proxy(this, {
      has(target: LiveRootNodeListImpl, propertyKey: string | number | symbol): boolean {
        if (typeof propertyKey === 'number') {
          return !!target.item(propertyKey)
        }
        return Reflect.has(target, propertyKey)
      },
      get(target: LiveRootNodeListImpl, propertyKey: string | number | symbol): any {
        if (typeof propertyKey === 'number') {
          return target.item(propertyKey) || undefined
        }
        return target[propertyKey as any]
      },
      ownKeys(target: LiveRootNodeListImpl): PropertyKey[] {
        const keys = Reflect.ownKeys(target)
        const {length} = target
        for (let index = 0; index < length; index++) {
          keys.push(index)
        }
        return keys
      },
    })
  }

  public get length(): number {
    let length = 0
    for (const _ of this.entries()) {
      length++
    }
    return length
  }

  public item(index: number): Node | null {
    let currentIndex = 0
    for (const node of this.values()) {
      if (currentIndex === index) {
        return node
      }
      currentIndex++
    }

    return null
  }

  public entries(): IterableIterator<[number, Node]> {
    let node: Node | null = this.firstNode
    const {lastNode} = this

    return function*(): IterableIterator<[number, Node]> {
      let key = 0
      while (node) {
        yield [key, node]
        key++
        if (node === lastNode) {
          break
        }
        node = node.nextSibling
      }
    }()
  }

  public keys(): IterableIterator<number> {
    const nodeList = this
    return function*(): IterableIterator<number> {
      for (const [key] of nodeList.entries()) {
        yield key
      }
    }()
  }

  public values(): IterableIterator<Node> {
    const nodeList = this
    return function*(): IterableIterator<Node> {
      for (const [, node] of nodeList.entries()) {
        yield node
      }
    }()
  }

  public forEach<T>(
    callback: (this: T, value: Node, index: number, list: NodeList) => void,
    thisValue?: T,
  ): void {
    for (const [index, node] of this.entries()) {
      callback.call(thisValue as T, node, index, this)
    }
  }

  public [Symbol.iterator](): IterableIterator<Node> {
    return this.values()
  }
}
