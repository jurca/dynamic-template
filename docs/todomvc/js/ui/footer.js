const FooterComponent = {
	template: document.createDynamicTemplate(`
		<footer class="footer">
			<span class="todo-count"><strong>`, `</strong> item`, ` left</span>
			<ul class="filters">
				<li>
					<a class="`, `" href="#/">All</a>
				</li>
				<li>
					<a class="`, `" href="#/active">Active</a>
				</li>
				<li>
					<a class="`, `" href="#/completed">Completed</a>
				</li>
			</ul>
			`, `
		</footer>
	`),
	init(isCompletedFilterState, dataStore, onClearCompleted) {
		const clearCompleted = ClearCompletedComponent.init(onClearCompleted)
		const instance = this.template.instantiate(templateProcessor, this.getTemplateData(
			dataStore,
			isCompletedFilterState,
			clearCompleted,
		))
		Object.assign(instance, {
			clearCompleted,
		})
		return instance
	},
	update(instance, isCompletedFilterState, dataStore) {
		instance.processor(instance, this.getTemplateData(
			dataStore,
			isCompletedFilterState,
			instance.clearCompleted,
		))
	},
	getTemplateData(dataStore, isCompletedFilterState, clearCompleted) {
		return [
			dataStore.items.filter(item => !item.isCompleted).length,
			dataStore.items.filter(item => !item.isCompleted).length !== 1 && 's',
			isCompletedFilterState === null ? "selected": null,
			isCompletedFilterState === false ? "selected": null,
			isCompletedFilterState === true ? "selected": null,
			dataStore.items.some(item => item.isCompleted) ? clearCompleted : null,
		]
	},
}
