const TodoItemComponent = {
	template: document.createDynamicTemplate(`
		<li class="`, `">
			<div class="view">
				<input class="toggle" type="checkbox" onchange="`, `" `, `>
				<label ondblclick="`, `">`, `</label>
				<button class="destroy" onclick="`, `"></button>
			</div>
			<input class="edit" onblur="`, `" onkeydown="`, `" `, `>
		</li>
	`),
	init(item, onSetCompleted, onDestroy) {
		const isCompletedCheckboxRef = {current: null}
		const inputRef = {current: null}
		const instance = this.template.instantiate(templateProcessor, this.getTemplateData(
			() => instance,
			item,
			isCompletedCheckboxRef,
			inputRef,
			onSetCompleted,
			onDestroy,
		))
		isCompletedCheckboxRef.current.checked = item.isCompleted
		Object.assign(instance, {
			isCompletedCheckboxRef,
			inputRef,
			onSetCompleted,
			onDestroy,
		})
		return instance
	},
	update(instance, item) {
		instance.isCompletedCheckboxRef.current.checked = item.isCompleted
		instance.processor(instance, this.getTemplateData(
			() => instance,
			item,
			instance.isCompletedCheckboxRef,
			instance.inputRef,
			instance.onSetCompleted,
			instance.onDestroy,
		))
	},
	getTemplateData(getInstance, item, isCompletedCheckboxRef, inputRef, onSetCompleted, onDestroy) {
		return [
			[item.isEditing && 'editing', item.isCompleted && 'completed'].filter(_ => _).join(' '),
			event => onSetCompleted(item, event.target.checked),
			isCompletedCheckboxRef,
			() => {
				item.isEditing = true
				this.update(getInstance(), item)
				inputRef.current.value = item.title
				inputRef.current.focus()
			},
			item.title,
			() => onDestroy(item),
			() => onSave(this),
			event => {
				if (event.key === "Enter") {
					onSave(this)
				} else if (event.key === "Escape") {
					item.isEditing = false
					this.update(getInstance(), item)
				}
			},
			inputRef,
		]

		function onSave(Component) {
			if (!item.isEditing) {
				return
			}

			const newTitle = inputRef.current.value.trim()
			if (newTitle) {
				item.title = newTitle
				item.isEditing = false
				Component.update(getInstance(), item)
			} else {
				onDestroy(item)
			}
		}
	},
}
