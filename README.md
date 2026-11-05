# CommutePass — Test technique backend (achats in-app)

Ma solution à un **test technique de recrutement** : analyser, sécuriser et faire évoluer le backend de vérification des achats in-app d'une application fictive de trottinettes et vélos en libre-service.

> Le projet *CommutePass* est un exemple neutre fourni par l'entreprise pour l'exercice. Ce n'est pas un produit réel.

## Contexte

Les utilisateurs achètent des **packs de crédits de trajet** par achat in-app (Apple StoreKit / Google Play Billing). Chaque déverrouillage de véhicule débite des crédits. Le dépôt contient :

- la **Edge Function** `verify-purchase`, qui vérifie le reçu auprès du store et crédite le compte ;
- l'endpoint `app-version`, qui force la mise à jour de l'application ;
- le schéma Postgres (achats, soldes, journal des crédits).

## Ce que j'ai livré

| Partie | Livrable | Contenu |
|---|---|---|
| A | [`NOTES.md`](NOTES.md) | Parcours d'un achat de bout en bout et tableau des risques repérés à la lecture du code |
| B | [`BUGREPORT.md`](BUGREPORT.md) | 7 bugs corrigés (B1 à B7) : cause racine, gravité, correctif, alternatives envisagées |
| C | Code + tests | Nouveau pack `credits_600`, comparaison semver corrigée, vraie suite de tests |
| D | [`RELEASE.md`](RELEASE.md) | Plan de mise en production : ordre des étapes, vérifications, rollback, réconciliation des données |
| – | [`SUBMISSION.md`](SUBMISSION.md) | Synthèse, vérifications effectuées et pistes d'amélioration |

### Correctifs principaux (sécurité de l'argent)

- **Montant des crédits calculé côté serveur** à partir du catalogue produits, et non plus envoyé par le client
- **Identité vérifiée** : le JWT est réellement vérifié (`SUPABASE_JWT_SECRET`) et c'est lui qui détermine le compte crédité
- **Crédit exactement une fois** : déduplication et crédit dans une seule transaction, avec un index unique sur l'identifiant de transaction du store (migration `0003`)
- **Google Play** : acquittement de l'achat ; **Apple** : sélection correcte dans `in_app` et bascule automatique vers la sandbox
- Plus de reçus enregistrés en clair dans les logs
- `app-version` compare les versions numériquement (et non plus comme des chaînes)

## Stack technique

| Élément | Technologie |
|---|---|
| Runtime | Deno, TypeScript |
| Backend | Supabase Edge Functions |
| Base de données | PostgreSQL |
| Paiements | Apple StoreKit, Google Play Billing |
| Client (extrait) | Capacitor (`app/purchase.ts`) |

## Structure

```
supabase/
├── migrations/          # 0001_init, 0002_purchases, 0003_unique_provider_txn
├── seed.sql             # utilisateurs et configuration de version
└── functions/
    ├── verify-purchase/ # vérification des achats in-app (cœur de l'exercice)
    ├── app-version/     # endpoint de mise à jour forcée
    └── _shared/         # catalogue produits, BDD, Apple, Google, auth
app/purchase.ts          # extrait du client Capacitor (contexte)
scripts/                 # script opérationnel hérité (à ne pas exécuter, voir RELEASE.md)
test/                    # tests Deno
fixtures/                # réponses de store simulées
```

## Lancer en local

Prérequis : [Deno](https://deno.com) et une base Postgres locale (par exemple via `supabase start`).

```bash
# Vérification des types
deno check supabase/functions/verify-purchase/index.ts

# Tests (9/9 au vert)
deno task test

# Lancer verify-purchase avec les stores simulés
IAP_MOCK=1 DATABASE_URL=postgres://postgres:postgres@localhost:54322/postgres \
  deno task serve:verify
```

Appliquer d'abord les fichiers de `supabase/migrations/`, puis `supabase/seed.sql`.

## Auteur

**Yosra Dab** — Ingénieure logiciel Full Stack · [Portfolio](https://yosradab.vercel.app) · [GitHub](https://github.com/yosradab) · [LinkedIn](https://linkedin.com/in/yosradab)
