# Data Layer Plugin

NX generator plugin for creating CRUD data layer hooks.

## Installation

The plugin is automatically available in the workspace.

## Usage

### Generate CRUD Hooks

```bash
nx g @open-insights-web/data-layer-plugin:crud product \
  --directory=libs/products/data-layer/src \
  --dataModel=@open-insights-web/products-data-model \
  --endpoint=/api/products \
  --pagination=true
```

### Options

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `name` | Entity name (e.g., 'product') | Yes | - |
| `directory` | Output directory | Yes | - |
| `dataModel` | Import path for types | Yes | - |
| `endpoint` | Base API endpoint | Yes | - |
| `idField` | ID field name | No | `id` |
| `pagination` | Use infinite query for list | No | `false` |
| `skipList` | Skip list hook | No | `false` |
| `skipDetail` | Skip detail hook | No | `false` |
| `skipCreate` | Skip create mutation | No | `false` |
| `skipUpdate` | Skip update mutation | No | `false` |
| `skipDelete` | Skip delete mutation | No | `false` |

### Generated Files

```
libs/products/data-layer/src/
├── product-keys.ts           # Query key factory
├── use-dl-product.ts         # Fetch single product
├── use-dl-product-list.ts    # Fetch product list
├── use-dl-create-product.ts  # Create mutation
├── use-dl-update-product.ts  # Update mutation
├── use-dl-delete-product.ts  # Delete mutation
└── index.ts                  # Public exports
```

### Data Model Requirements

Your data model package should export these types:

```typescript
// For entity "product"
export interface Product {
  id: string;
  name: string;
  // ... other fields
}

export interface ProductFilters {
  status?: string;
  search?: string;
  // ... other filter fields
}

export interface CreateProductInput {
  name: string;
  // ... create fields (without id)
}

export interface UpdateProductInput {
  id: string;
  name?: string;
  // ... update fields (with id)
}
```

## Example Usage

```tsx
import {
  productKeys,
  useDLProduct,
  useDLProductList,
  useDLCreateProduct,
  useDLUpdateProduct,
  useDLDeleteProduct,
} from '@open-insights-web/products-data-layer';

// Fetch single product
function ProductDetail({ id }) {
  const { data, isLoading } = useDLProduct(id);
  // ...
}

// Fetch product list
function ProductList() {
  const { data, isLoading } = useDLProductList({ status: 'active' });
  // ...
}

// Create product
function CreateProductForm() {
  const mutation = useDLCreateProduct();
  mutation.mutate({ name: 'New Product' });
}

// Update product
function UpdateProductForm({ product }) {
  const mutation = useDLUpdateProduct();
  mutation.mutate({ id: product.id, name: 'Updated Name' });
}

// Delete product
function DeleteButton({ id }) {
  const mutation = useDLDeleteProduct();
  mutation.mutate(id);
}
```

## Building the Plugin

```bash
nx build data-layer-plugin
```
