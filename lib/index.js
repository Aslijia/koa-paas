"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const is = __importStar(require("is"));
const routers = {};
let workspace = '';
const loader = function (file) {
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
    }
    catch (err) {
        // Logger.getLogger('controller').debug('loader failed', { message: err.message, file });
        return;
    }
};
const router = async function (ctx, next) {
    const exists_file = path.join(workspace, ctx.path);
    let processor = routers[exists_file];
    if (!processor) {
        processor = loader(exists_file);
    }
    const method = ctx.method.toUpperCase();
    if (!processor || !is.function(processor[method])) {
        return await next();
    }
    let ok = await filters(workspace, ctx.path.split('/'), ctx).catch((err) => { });
    if (ok) {
        await processor[method](ctx).catch((err) => { });
        if (ctx.status === 404) {
            return await next();
        }
        await afters(ctx.path.split('/'), ctx);
    }
};
const filters = async function (root, paths, ctx) {
    if (paths.length === 0) {
        return true;
    }
    let exists_file = path.join(root, paths[0]);
    let filter = loader(exists_file);
    if (filter && is.function(filter.filter)) {
        const ok = await filter.filter(ctx);
        if (!ok) {
            return false;
        }
    }
    return await filters(path.join(root, paths.shift() || ''), paths, ctx);
};
const afters = async function (paths, ctx) {
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
};
function default_1(root) {
    workspace = root;
    fs.watch(workspace, { recursive: true }, (event, filename) => {
        const detail = path.parse(filename);
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
exports.default = default_1;
