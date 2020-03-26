document.createDynamicTemplate = (htmlFragments: Readonly<ArrayLike<string>>): DynamicDocumentTemplate => {
  return undefined
}

class DynamicDocumentTemplateImpl implements DynamicDocumentTemplate {
  constructor(
    private readonly parsedTemplate: DocumentFragment,
  ) {
  }

  instantiate<A>(processor?: DynamicTemplateProcessor<A>, processorArguments?: A): DynamicDocumentFragment<A> {
    const instanceFragment = this.parsedTemplate.cloneNode(true) as DocumentFragment
    const parts: DynamicTemplatePart[] = []

    const instance = Object.assign(instanceFragment, {
      processor: processor || null,
      parts: new DynamicTemplatePartListImpl(parts),
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
    } else {
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
      if (typeof node === 'string') {
        const reusableNodeIndex = currentTextNodesMappableToNewStrings.findIndex(
          textNode => textNode.nodeValue === node
        )
        if (reusableNodeIndex > -1) {
          const reusableNode = currentTextNodesMappableToNewStrings.splice(reusableNodeIndex, 1)[0]
          return reusableNode
        }
        return document.createTextNode(node)
      }

      return node
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

  get length(): number {
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
