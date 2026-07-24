# Vendored third-party assets

`swagger-ui.css` and `swagger-ui-bundle.js` are taken verbatim from
[swagger-api/swagger-ui](https://github.com/swagger-api/swagger-ui) `swagger-ui-dist@5.17.14`,
licensed under **Apache License 2.0**.

They are vendored rather than loaded from a CDN so the API explorer has no external
runtime dependency and works on networks that block public CDNs.

To update:

```bash
curl -fsSL -o swagger-ui.css       https://unpkg.com/swagger-ui-dist@<version>/swagger-ui.css
curl -fsSL -o swagger-ui-bundle.js https://unpkg.com/swagger-ui-dist@<version>/swagger-ui-bundle.js
```
