# SecHandCharity
Repo for final year mini project handled by Jere, Loh, Adam, Ivan.


# Team, Please Take Note:
## Github Branches
- DO NOT TOUCH the "main" branch
- Only work inside of your own branches thank you
- Also only edit files within your own module folders, you may view outside files but no editing them
- You will be informed if I need you to merge main into your branch for updates

## Database Information
- You can find the tables and column names in the /database/schema.sql file

## Naming Conventions
File names: Use kebab-case for names.
Example: "user-profile.html", "item-menu.html"

HTML: kebab-case
Example: "item-title-input"
```html
<input type="text" id="item-title-input"/>
```

CSS: kebab-case
Example: "card-title"
```css
.card-title {
  font-size: 16px;
  background-color: #f4f4f4;
}
```

JavaScript: camelCase & UPPERCASE_SNAKE_CASE
Example: "userEmail" / "DEFAULT_NAME"
```js
const userEmail = "xxx@gmail.com";
const DEFAULT_NAME = "name";
```

SQL: snake_case
Example: "item_listings"
```sql
CREATE TABLE item_listings (
    listing_id UUID PRIMARY KEY,
    item_title VARCHAR(250),
    created_at TIMESTAMP
);
```

## Indentation
Use 2 spaces for indenting
Example:
```html
<body>
  <div>
    <h1>Hello World</h1>
  </div>
</body>
```

## Template For HTML Files
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SecHandCharity</title>

  <!-- Styling -->
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/sidebar.css">
</head>
<body>
  <!-- Remove this whole <div> if you don't need the sidebar on this page -->
  <div class="app-layout">
    <aside id="sidebar"></aside>
    <main class="main-content">
      <!-- Your page content goes here -->
      <h1>This is index.html!</h1>
      
    </main>
  </div>

  <!-- Scripts -->
  <script type="module" src="/assets/js/sidebar.js"></script>
  <script type="module" src="/assets/js/script.js"></script>
</body>
</html>
```