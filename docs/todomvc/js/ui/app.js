const AppComponent = {
	template: document.createDynamicTemplate(`
		`, `
		`, `
		`, `
	`),
	init(isCompletedFilterState, dataStore) {
		const header = HeaderComponent.init(newItemTitle => {
			dataStore.items.push({
				isEditing: false,
				isCompleted: false,
				title: newItemTitle,
			})
			this.update(instance, instance.isCompletedFilterState)
		})
		const todoList = TodoListComponent.init(
			dataStore,
			isCompletedFilterState,
			(item, isCompleted) => {
				item.isCompleted = isCompleted
				this.update(instance, instance.isCompletedFilterState)
			},
			item => {
				dataStore.items = dataStore.items.filter(otherItem => otherItem !== item)
				this.update(instance, instance.isCompletedFilterState)
			},
		)
		const footer = FooterComponent.init(isCompletedFilterState, dataStore, () => {
			dataStore.items = dataStore.items.filter(item => !item.isCompleted)
			this.update(instance, instance.isCompletedFilterState)
		})

		const instance = this.template.instantiate(templateProcessor, this.getTemplateData(
			dataStore,
			header,
			todoList,
			footer,
		))
		Object.assign(instance, {
			isCompletedFilterState,
			dataStore,
			header,
			todoList,
			footer,
		})
		return instance
	},
	update(instance, isCompletedFilterState) {
		TodoListComponent.update(instance.todoList, instance.dataStore, isCompletedFilterState)
		FooterComponent.update(instance.footer, isCompletedFilterState, instance.dataStore)
		instance.isCompletedFilterState = isCompletedFilterState
		instance.processor(instance, this.getTemplateData(
			instance.dataStore,
			instance.header,
			instance.todoList,
			instance.footer,
		))
	},
	getTemplateData(dataStore, header, todoList, footer) {
		return [
			header,
			!!dataStore.items.length && todoList,
			!!dataStore.items.length && footer,
		]
	},
}
