interface Document extends DynamicDocumentFragmentBroker {}

interface DynamicDocumentFragmentBroker {
  createDynamicTemplate(htmlFragments: ArrayLike<string>): DynamicDocumentTemplate
}

interface DynamicDocumentTemplate {
  instantiate<A>(processor?: DynamicTemplateProcessor<A>, processorArguments?: A): DynamicDocumentFragment<A>
}

interface DynamicTemplateProcessor<A> {
  (dynamicDocumentFragment: DynamicDocumentFragment<A>, processorArguments: A | undefined): void
}

interface DynamicDocumentFragment<PA> extends DocumentFragment {
  readonly processor: DynamicTemplateProcessor<PA> | null
  readonly parts: DynamicTemplatePartList
}

interface DynamicTemplatePartList extends Iterable<DynamicTemplatePart> {
  readonly length: number

  [index: number]: DynamicTemplatePart | undefined
  item(index: number): DynamicTemplatePart | null
  keys(): IterableIterator<number>
  values(): IterableIterator<DynamicTemplatePart>
  entries(): IterableIterator<[number, DynamicTemplatePart]>
  forEach<T>(
    callback: (this: T, value: DynamicTemplatePart, index: number, list: DynamicTemplatePartList) => void,
    thisValue?: T,
  ): void
}

enum PartType {
  ATTRIBUTE_PART,
  ELEMENT_PART,
  NODE_RANGE_PART,
}

interface DynamicTemplatePart {
  readonly ATTRIBUTE_PART: PartType.ATTRIBUTE_PART
  readonly ELEMENT_PART: PartType.ELEMENT_PART
  readonly NODE_RANGE_PART: PartType.NODE_RANGE_PART

  readonly partType: PartType
}

interface DynamicTemplateAttributePart extends DynamicTemplatePart {
  readonly partType: PartType.ATTRIBUTE_PART
  readonly element: Element
  readonly attribute: Attr
  readonly attributeName: string
  value: string | null
}

interface DynamicTemplateElementPart extends DynamicTemplatePart {
  readonly partType: PartType.ELEMENT_PART
  readonly element: Element
}

interface DynamicTemplateNodeRangePart<PA> extends DynamicTemplatePart {
  readonly partType: PartType.NODE_RANGE_PART
  readonly parentNode: Element | DynamicDocumentFragment<PA>
  readonly nodes: NodeRange
  replaceWith(...nodes: ReadonlyArray<string | Node>): void
}

interface NodeRange extends Iterable<Node> {
  readonly length: number
  readonly parentNode: Node

  [index: number]: Node | undefined
  item(index: number): Node | null
  replaceNode(newNode: Node, oldNode: Node): void
  insertBefore(newNode: Node, refNode: Node | null): void
  appendNode(node: Node): void
  removeNode(node: Node): void
  keys(): IterableIterator<number>
  values(): IterableIterator<Node>
  entries(): IterableIterator<[number, Node]>
  forEach<T>(
    callback: (this: T, value: Node, index: number, list: NodeRange) => void,
    thisValue?: T,
  ): void
}
