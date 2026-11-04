# DiplomaMinProj
Repo for mini project handled by Jere, Loh, and Adam.


# Please Follow:
## Github Branches
- DO NOT TOUCH the "main" branch
- If you want to work on something, please use your own "branch" and commit work there, and only edit files in your own "modules" part
- The "branch" you're using will be shown at the bottom left of your VSCode, make sure its never on "main" and only on your branch
- If you finished a big section of your module and its working correctly, you can submit a "pull request" inside GitHub and I'll check it.
- If I merge the pull request, then please "commit" and "pull" from "main" and open a new branch for yourself and work there
- Just ask Jere for help if you unsure about anything

Example Steps:
1. main > pull
2. main > create new branch, example name: "feature/login-page", "feature/user-reviews"
3. main > enter your branch
4. feature/login-page > edit your own files in your "modules" folder
5. feature/login-page > push & commit whenever you finish something
6. feature/login-page > when big part all working and finished, tell Jere
7. feature/login-page > submit a pull request
8. main > your pull request got merged into main
9. main > everyone commit their changes first then pull from main and repeat/continue


## Naming Conventions
File names: Use kebab-case for names.
Example: "user-profile.html", "item-listing.html"

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

JavaScript: camelCase
Example: "userEmail"
```js
const userEmail = "xxx@gmail.com";
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
Use 2 spaces for indenting, don't use Tab.
Example:
```html
<body>
  <div>
    <h1>Hello World</h1>
  </div>
</body>
```