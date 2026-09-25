# EtiquetaHub

Etiquetas de Mercado Libre, Falabella y Paris en 100 × 150 mm para varios vendedores con un fulfillment compartido.

- `etiquetahub.js`: la app completa (un solo archivo).
- `render.yaml`: configuración para publicarla gratis en Render.
- `.github/workflows/respaldo.yml`: guarda cada 15 minutos un respaldo cifrado en la rama `backup`.

El respaldo está cifrado con `APP_SECRET`, que solo existe en Render.
