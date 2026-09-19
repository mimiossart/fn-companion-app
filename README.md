# FN Companion

App web responsive : accueil, navigation réelle, carte interactive, défis, catalogue d’objets, profil local et page de données live.

## Données live
Le endpoint Netlify `/api/fortnite/islands` utilise l’API Fortnite Ecosystem et le flux OAuth client-credentials d’Epic quand `EPIC_CLIENT_ID` et `EPIC_CLIENT_SECRET` sont configurés dans Netlify.

Les secrets restent côté serveur. Aucun mot de passe Epic n’est demandé par l’interface.
