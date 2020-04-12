const HeaderComponent = {
	template: document.createDynamicTemplate(`
		<header class="header">
      <h1>todos</h1>
      <input class="new-todo" placeholder="What needs to be done?" autofocus onkeydown="`, `">
    </header>
	`),
	init(onCreateItem) {
		const instance = this.template.instantiate(templateProcessor, [
			event => {
				if (event.key === 'Enter') {
					const todoItemTitle = event.target.value.trim()
					if (todoItemTitle) {
						onCreateItem(todoItemTitle)
						event.target.value = ''
					}
				}
			},
		])
		return instance
	},
}
