function routerFactory(onFilterUpdate) {
	const routes = {
		'/': onFilterUpdate.bind(null, null),
		'/active': onFilterUpdate.bind(null, false),
		'/completed': onFilterUpdate.bind(null, true),
	}
	const router = new Router(routes)
	router.init()
	return router
}
