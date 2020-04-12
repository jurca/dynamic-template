(function () {
	'use strict';

	const container = document.getElementsByClassName('todoapp')[0]
	let uiInstance = null

	let isCompletedFilterState = null
	routerFactory(newFilterState => {
		isCompletedFilterState = newFilterState
		renderUI()
	})

	renderUI()

	function renderUI() {
		if (!uiInstance) {
			uiInstance = AppComponent.init(isCompletedFilterState, dataStoreFactory())
			container.appendChild(uiInstance)
		} else {
			AppComponent.update(uiInstance, isCompletedFilterState)
		}
	}
})();
