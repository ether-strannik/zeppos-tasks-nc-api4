let messageBuilder;

export function prepareFetch(builder) {
    messageBuilder = builder;
}

export function clientFetch(url, params) {
    const fetchData = {
        method: "GET",
        url,
        ...params,
    };

    return messageBuilder.request({
        package: "fetch_fwd",
        data: fetchData
    }, {timeout: params.timeout ? params.timeout : 120000}).then((r) => {
        return {
            status: r.status,
            json: () => Promise.resolve(r.json),
        }
    })
}

export function handleFetchRequest(ctx, request) {
    if(request.package !== "fetch_fwd") return;
    request = request.data;

    fetch(request).then((res) => {
        let data = res.body;
        if (typeof res.body === 'string') {
            try {
                data = JSON.parse(res.body);
            } catch(e) {
                data = null;
            }
        }

        ctx.response({
            data: {
                status: res.status,
                json: data
            }
        })
    }).catch((e) => {
        ctx.response({
            data: {
                status: 0,
                json: {error: `${e.name}: ${e.message}`}
            }
        })
    })
}
