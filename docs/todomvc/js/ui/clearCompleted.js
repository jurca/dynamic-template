const ClearCompletedComponent = {
	template: document.createDynamicTemplate(`
		<button class="clear-completed" onclick="`, `">Clear completed</button>
	`),
	init(onClick) {
		const instance = this.template.instantiate(templateProcessor, [
			onClick,
		])
		return instance
	},
}
