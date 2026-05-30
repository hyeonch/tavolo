# Domain Notes

Tavolo is a local-first personal cooking record web app.

Core language:

- A `Meal` is the dish itself: what the food is, optional recipe link, notes, and tags.
- A `MealRecord` is an event of cooking or eating a meal on a date.
- A `Media` item belongs to a `MealRecord`, because photos/videos capture a specific cooking instance.
- Tags currently belong to `Meal`, because tags such as cuisine, category, or style describe the dish itself.

Use Korean user-facing copy by default.

Platform direction:

- The MVP is web-app-first.
- Browser local data persistence is part of the product model, not a temporary implementation detail.
- Photos are local personal archive media; for the web MVP, prioritize reliable browser-local persistence over native device file APIs.
