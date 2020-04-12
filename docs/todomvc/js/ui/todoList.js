const TodoListComponent = {
	template: document.createDynamicTemplate(`
		<section class="main">
			<input id="toggle-all" class="toggle-all" type="checkbox" onchange="`, `" `, `>
			<label for="toggle-all">Mark all as complete</label>
			<ul class="todo-list">
				`, `
			</ul>
		</section>
	`),
	init(dataStore, isCompletedFilterState, onSetCompleted, onDestroy) {
		const toggleAllCheckboxRef = {current: null}
		const itemInstances = new WeakMap()
		const instance = this.template.instantiate(templateProcessor, this.getTemplateData(
			toggleAllCheckboxRef,
			dataStore,
			isCompletedFilterState,
			itemInstances,
			onSetCompleted,
			onDestroy,
		))
		Object.assign(instance, {
			toggleAllCheckboxRef,
			itemInstances,
			onSetCompleted,
			onDestroy,
		})
		return instance
	},
	update(instance, dataStore, isCompletedFilterState) {
		for (const item of dataStore.items) {
			const itemInstance = instance.itemInstances.get(item)
			if (itemInstance) {
				TodoItemComponent.update(itemInstance, item)
			}
		}
		instance.processor(instance, this.getTemplateData(
			instance.toggleAllCheckboxRef,
			dataStore,
			isCompletedFilterState,
			instance.itemInstances,
			instance.onSetCompleted,
			instance.onDestroy,
		))
		if (dataStore.items.length) {
			instance.toggleAllCheckboxRef.current.checked = dataStore.items.every(item => item.isCompleted)
		} else {
			instance.toggleAllCheckboxRef.current.checked = false
		}
	},
	getTemplateData(toggleAllCheckboxRef, dataStore, isCompletedFilterState, itemInstances, onSetCompleted, onDestroy) {
		return [
			event => {
				const isCompleted = event.target.checked
				for (const item of dataStore.items) {
					onSetCompleted(item, isCompleted)
				}
			},
			toggleAllCheckboxRef,
			dataStore.items.filter(
				item => isCompletedFilterState === null || item.isCompleted === isCompletedFilterState
			).map(item => {
				const itemInstance = itemInstances.get(item) || TodoItemComponent.init(item, onSetCompleted, onDestroy)
				itemInstances.set(item, itemInstance)
				return itemInstance
			}),
		]
	},
}
