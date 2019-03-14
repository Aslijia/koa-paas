import * as fs from 'fs';
import * as path from 'path';
import * as is from 'is';

import { Context } from 'koa';

const routers: any = {};
let workspace: string = '';

const loader = function (file: string): any {
    const detail = path.parse(file);
    if (is.empty(detail.ext)) {
        let real = loader(file + '.js');
        if (!real) {
            real = loader(path.join(file, detail.base + '.js'));
        }
        if (!real) {
            real = loader(path.join(file, 'index.js'));
        }
        return real;
    }

    if (routers[file]) {
        return routers[file];
    }

    try {
        routers[file] = require(file);
        return routers[file];
    } catch (err) {
        return;
    }
}

const router = async function (ctx: Context, next: () => Promise<any>) {
    const exists_file = path.join(workspace, ctx.path);
    let processor: any = routers[exists_file];
    if (!processor) {
        processor = loader(exists_file);
    }
    const method = ctx.method.toUpperCase();
    if (!processor || !is.function(processor[method])) {
        return await next();
    }
    let ok = await filters(workspace, ctx.path.split('/'), ctx).catch((err) => { });
    if (ok) {
        await processor[method](ctx).catch((err: any) => { });
        if (ctx.status === 404) {
            return await next();
        }
        await afters(ctx.path.split('/'), ctx);
    }
};

const filters = async function (root: string, paths: string[], ctx: Context): Promise<boolean> {
    if (paths.length === 0) {
        return true;
    }
    let exists_file = path.join(root, paths[0]);
    let filter: any = loader(exists_file);
    if (filter && is.function(filter.filter)) {
        const ok = await filter.filter(ctx);
        if (!ok) {
            return false;
        }
    }

    return await filters(path.join(root, paths.shift() || ''), paths, ctx);
};

const afters = async function (paths: string[], ctx: Context): Promise<void> {
    if (paths.length === 0) {
        return;
    }

    let exists_file = path.join(workspace, paths.join('/'));
    const after = loader(exists_file);
    if (after && is.function(after.after)) {
        await after.after();
    }
    paths.pop();
    return await afters(paths, ctx);
}

export default function (root: string) {
    workspace = root;
    fs.watch(workspace, { recursive: true }, (event: string, filename: string) => {
        const detail: path.ParsedPath = path.parse(filename);
        if (detail.ext !== '.js') {
            return;
        }
        const file = path.join(workspace, filename);
        delete require.cache[file];
        delete routers[file];
        loader(file);
    });
    return router;
}
