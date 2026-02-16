# Data Layer Plugin

Nx generator plugin for creating CRUD wrapper hooks aligned with `@open-insights-web/foundation-data-layer`.

## Usage

```bash
nx g @open-insights-web/data-layer-plugin:crud product \
  --directory=libs/products/data-layer/src \
  --dataModel=@open-insights-web/products-data-model \
  --endpoint=/api/products
```

## Options

| Option       | Description                                            | Required | Default |
| ------------ | ------------------------------------------------------ | -------- | ------- |
| `name`       | Entity name (for example `product`)                    | Yes      | -       |
| `directory`  | Output directory                                       | Yes      | -       |
| `dataModel`  | Import path for data-model types                       | Yes      | -       |
| `endpoint`   | Logical endpoint label used in generated docs/comments | Yes      | -       |
| `idField`    | Entity ID field name                                   | No       | `id`    |
| `pagination` | Include pagination-oriented list input helpers         | No       | `false` |
| `skipList`   | Skip list hook file                                    | No       | `false` |
| `skipDetail` | Skip detail hook file                                  | No       | `false` |
| `skipCreate` | Skip create hook file                                  | No       | `false` |
| `skipUpdate` | Skip update hook file                                  | No       | `false` |
| `skipDelete` | Skip delete hook file                                  | No       | `false` |

## Generated Files

```
libs/products/data-layer/src/
├── product-keys.ts
├── use-dl-product.ts
├── use-dl-product-list.ts
├── use-dl-create-product.ts
├── use-dl-update-product.ts
├── use-dl-delete-product.ts
└── index.ts
```

## Generated API Shape

- `useDLGet<Product>Query`
- `useDLGet<Product>ListQuery`
- `useDLCreate<Product>`
- `useDLUpdate<Product>`
- `useDLDelete<Product>`

The generated hooks are wrappers around:

- `useDLGet` / `useDLGetList` / `useDLGetOne`
- `useDLCreate` / `useDLUpdate` / `useDLDelete`

You provide Convex `query` / `mutation` references and optional args; wrappers provide table naming and query-key defaults.
