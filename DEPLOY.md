# 🚂 Guide de déploiement — S-ONE Bot sur Railway
> Hackend — Systeme.one

---

## Ce dont tu as besoin avant de commencer

- [ ] Un compte [Railway.app](https://railway.app)
- [ ] Ton repo GitHub avec le code du bot déjà pushé
- [ ] Ton bot Discord créé sur [discord.com/developers](https://discord.com/developers/applications)
- [ ] Tes variables d'environnement à portée de main (`.env.example` comme référence)

---

## ÉTAPE 1 — Créer le bot Discord (si pas encore fait)

1. Va sur [discord.com/developers/applications](https://discord.com/developers/applications)
2. Clique **New Application** → donne un nom (ex: `S-ONE Bot`)
3. Dans l'onglet **Bot** :
   - Clique **Add Bot**
   - Copie le **Token** → c'est ta variable `DISCORD_TOKEN`
   - Active les 3 **Privileged Gateway Intents** :
     - ✅ PRESENCE INTENT
     - ✅ SERVER MEMBERS INTENT
     - ✅ MESSAGE CONTENT INTENT
4. Dans l'onglet **General Information** :
   - Copie l'**Application ID** → c'est ta variable `CLIENT_ID`

### Inviter le bot sur ton serveur

Toujours dans le Developer Portal :

1. Onglet **OAuth2 → URL Generator**
2. Coche **bot** + **applications.commands**
3. Dans les permissions bot, coche **Administrator**
4. Copie l'URL générée, ouvre-la → invite le bot sur ton serveur

---

## ÉTAPE 2 — Préparer le repo GitHub

Vérifie que ces fichiers sont bien présents à la racine de ton repo :

```
sone-bot/
├── .gitignore          ✅ (exclut .env et node_modules)
├── Procfile            ✅ (web: node index.js)
├── railway.toml        ✅ (config Railway)
├── package.json        ✅ (start script: node index.js)
├── index.js
└── ...
```

> ⚠️ **Vérifie que `.env` n'est PAS dans ton repo.** Si tu vois `.env` dans GitHub, supprime-le immédiatement — tes tokens seraient exposés.

Si tu n'as pas encore pushé les nouveaux fichiers :

```bash
git add Procfile railway.toml .gitignore
git commit -m "feat: add Railway config files"
git push
```

---

## ÉTAPE 3 — Créer le projet sur Railway

1. Va sur [railway.app](https://railway.app) → **New Project**
2. Clique **Deploy from GitHub repo**
3. Connecte ton compte GitHub si ce n'est pas fait
4. Sélectionne ton repo `sone-bot`
5. Railway détecte automatiquement Node.js et lance le build

> Railway va essayer de démarrer le bot — il va **crasher** pour l'instant car les variables d'environnement ne sont pas encore configurées. C'est normal, on les ajoute à l'étape suivante.

---

## ÉTAPE 4 — Configurer les variables d'environnement

C'est l'étape la plus importante. Dans Railway :

1. Clique sur ton service (le nom de ton repo)
2. Onglet **Variables**
3. Clique **New Variable** pour chaque ligne ci-dessous

### Variables OBLIGATOIRES (le bot ne démarre pas sans elles)

| Nom | Valeur | Où la trouver |
|-----|--------|---------------|
| `DISCORD_TOKEN` | `Mxxxxxxxxxxxxxxx.Gxxxxx.xxx` | Discord Dev Portal → Bot → Token |
| `CLIENT_ID` | `123456789012345678` | Discord Dev Portal → General Information → App ID |
| `LICENSE_KEY` | `SONE-XXXX-XXXX-XXXX-XXXX` | Ta clé définie (format libre, ex: `SONE-2024-HACK-END1`) |
| `HACKEND_USER_ID` | `1223607698113695836` | Déjà fixé — c'est ton ID Discord |

### Variables pour n8n (si tu l'utilises)

| Nom | Valeur |
|-----|--------|
| `N8N_WEBHOOK_SECRET` | Un mot de passe fort (ex: `sup3rS3cr3t!`) |
| `N8N_TESTIMONIAL_CREATE_URL` | `https://ton-n8n.com/webhook/testimonial-create` |
| `N8N_TESTIMONIAL_CHECK_URL` | `https://ton-n8n.com/webhook/testimonial-check` |

> Si tu n'as pas encore n8n configuré, laisse ces variables vides pour l'instant. Le bot fonctionnera mais la commande `/témoignage` retournera une erreur.

### Variable optionnelle

| Nom | Valeur |
|-----|--------|
| `NODE_ENV` | `production` |

> ❌ Ne mets PAS de variable `PORT` manuellement — Railway l'injecte lui-même.

### Comment ajouter les variables en masse (plus rapide)

Dans Railway → Variables → clique **RAW Editor** et colle directement :

```
DISCORD_TOKEN=TON_TOKEN_ICI
CLIENT_ID=TON_CLIENT_ID_ICI
LICENSE_KEY=SONE-TON-CODE-ICI
HACKEND_USER_ID=1223607698113695836
N8N_WEBHOOK_SECRET=ton_secret_n8n
NODE_ENV=production
```

---

## ÉTAPE 5 — Vérifier le déploiement

Après avoir ajouté les variables, Railway redémarre automatiquement le service.

1. Dans Railway → ton service → onglet **Logs**
2. Tu dois voir quelque chose comme :

```
[DB] Schema patched — kv_store, shop_products, shop_orders ready.
[Event] interactionCreate chargé
[Event] messageCreate chargé
[Event] ready chargé
[Event] voiceStateUpdate chargé
[API] Serveur interne démarré sur le port 3000
[Discord] Login en cours...
✅ S-ONE Bot connecté en tant que S-ONE Bot#1234
   Serveurs : 1
   Designed by Hackend — Systeme.one
[FocusCron] Démarré — vérification toutes les minutes.
```

Si tu vois des erreurs, lis la section **Erreurs fréquentes** en bas de ce guide.

---

## ÉTAPE 6 — Enregistrer les slash commands Discord

Cette étape est à faire **une seule fois** (ou à chaque fois que tu ajoutes/modifies une commande).

Railway ne peut pas lancer `deploy-commands.js` automatiquement. Tu as deux options :

### Option A — En local sur ton PC (recommandé)

```bash
# Clone ton repo ou va dans le dossier du bot
cd sone-bot

# Crée un .env local avec tes vraies valeurs
cp .env.example .env
# Édite .env et remplis DISCORD_TOKEN et CLIENT_ID

# Installe les dépendances
npm install

# Lance l'enregistrement
node deploy-commands.js
```

Tu dois voir :
```
🔄 Enregistrement de 9 slash commands...
✅ Slash commands enregistrées avec succès !
```

### Option B — Via Railway (one-shot)

Dans Railway → ton service → onglet **Settings** → **Deploy** :
- Sous **Start Command**, mets temporairement : `node deploy-commands.js`
- Sauvegarde → attends que ça tourne → remets `node index.js`

> Après ça, les commandes `/setup`, `/shop`, `/dashboard`, etc. sont disponibles sur ton serveur Discord.

---

## ÉTAPE 7 — Configurer le bot sur Discord

Sur ton serveur Discord :

1. Tape `/setup` dans n'importe quel salon
2. Un modal s'ouvre → entre ta **LICENSE_KEY** (exactement comme dans Railway)
3. Suis les 4 étapes de l'assistant :
   - **Étape 1** : Crée automatiquement les rôles (Bot Manager, 🔒 Prison) et le salon `#sone-logs`
   - **Étape 2** : Entre les IDs des rôles Coach et Élève
   - **Étape 3** : Personnalise le nom du bot
   - **Étape 4** : Active/désactive les récompenses vocales et texte

---

## ÉTAPE 8 — Configurer cron-job.org pour le keep-alive

Railway en mode gratuit peut mettre en veille les Web Services après inactivité. Le ping HTTP via cron-job.org maintient le service actif.

1. Va sur [cron-job.org](https://cron-job.org) → **Create Cronjob**
2. **URL** : `https://TON-DOMAINE-RAILWAY.railway.app/health`
   - Trouve ton domaine Railway dans : ton service → **Settings** → **Domains** → génère un domaine public
3. **Schedule** : toutes les 5 minutes (`*/5 * * * *`)
4. **Expected status** : `200`
5. Sauvegarde

Pour tester : ouvre l'URL `/health` dans ton navigateur, tu dois voir :
```json
{"status":"ok","bot":"S-ONE Bot","by":"Hackend - Systeme.one"}
```

---

## ÉTAPE 9 — Vérifier que tout fonctionne

Checklist finale sur Discord :

- [ ] `/setup` → l'assistant se lance avec le modal de licence
- [ ] `/dashboard` → le classement s'affiche
- [ ] `/shop` → la boutique s'affiche (vide si aucun produit configuré)
- [ ] `/paramètres` → le menu de configuration s'affiche
- [ ] `/paramètres → 🛒 Gérer le Shop → ➕ Ajouter un produit` → création d'un produit test
- [ ] Le bot est bien listé comme **En ligne** dans la liste des membres

---

## 🚨 Erreurs fréquentes

### `Error: Used disallowed intents`
➜ Dans Discord Dev Portal → Bot → active les 3 Privileged Gateway Intents

### `TokenInvalid` / `An invalid token was provided`
➜ Vérifie la variable `DISCORD_TOKEN` dans Railway. Régénère le token si besoin (Dev Portal → Bot → Reset Token)

### `Cannot find module 'better-sqlite3'`
➜ Dans Railway → ton service → **Settings** → force un **Redeploy** pour que npm install se relance

### Les slash commands n'apparaissent pas sur Discord
➜ Relance `node deploy-commands.js` — Discord peut prendre jusqu'à 1h pour propager les commandes globales (généralement instantané)

### Le bot se déconnecte toutes les heures
➜ Vérifie que cron-job.org ping bien `/health` toutes les 5 min. Vérifie dans les logs Railway qu'il n'y a pas de crash en boucle.

### `SQLITE_CANTOPEN` ou erreur de base de données
➜ Railway **ne persiste pas les fichiers** par défaut entre les redéploiements. Toute la DB SQLite est perdue à chaque deploy. Pour une persistance réelle, il faut ajouter un **Volume Railway** :
  - Dans ton projet Railway → **New** → **Volume**
  - Monte le volume sur `/app/data`
  - Le dossier `data/sone.db` sera alors persisté entre les redéploiements

---

## 🗄️ Ajouter un Volume Railway (IMPORTANT — persistance de la DB)

Sans volume, ta base SQLite est **réinitialisée à chaque redéploiement**. Tous les points, commandes et configurations sont perdus.

1. Dans ton projet Railway → clique **+ New** → **Volume**
2. Dans les settings du volume :
   - **Mount Path** : `/app/data`
3. Railway relie automatiquement le volume à ton service
4. Le fichier `data/sone.db` est maintenant persisté définitivement

> C'est la seule chose payante dans la config Railway (gratuit jusqu'à 1 GB). Sans ça, le bot fonctionnera mais perdra toutes ses données à chaque deploy.

---

## Récapitulatif de la config Railway

```
Service type    : Web Service
Build command   : npm install (automatique)
Start command   : node index.js
Health check    : /health
Node version    : 18+ (détecté automatiquement via engines dans package.json)
Volume          : /app/data  ← OBLIGATOIRE pour la persistance
```

---

*⚡ Designed by Hackend — Systeme.one*
