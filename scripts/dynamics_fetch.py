#!/usr/bin/env python3
"""
Extraction des requetes citoyennes (entite "incident") depuis le Web API
de Dynamics 365 / Dataverse, par authentification interactive (device code).

A executer sur une machine dont le reseau atteint *.dynamics.com et
login.microsoftonline.com (PAS depuis cet environnement Claude Code, dont
la politique reseau bloque terrebonne.crm3.dynamics.com).

Installation :
    pip install msal requests

Premier essai (recommande) - valide l'auth et affiche 1 enregistrement brut
pour verifier les noms de champs avant d'exporter :
    python dynamics_fetch.py --org https://terrebonne.crm3.dynamics.com --probe

Export complet vers CSV (colonnes alignees sur l'export Excel existant) :
    python dynamics_fetch.py --org https://terrebonne.crm3.dynamics.com --out requetes.csv

Export incremental (seulement les requetes creees depuis une date) :
    python dynamics_fetch.py --org https://terrebonne.crm3.dynamics.com --out requetes.csv --since 2026-01-01

Notes :
- L'authentification est deleguee (ton propre compte utilisateur) : les
  resultats sont limites a ce que ce compte a le droit de voir dans le CRM.
- Le client_id utilise (51f81489-12ee-4a9e-aaae-a2591f45987d) est un client
  public Microsoft de longue date, largement reutilise par des outils
  communautaires (XrmToolBox, modules PowerShell Xrm) pour l'auth interactive
  a Dataverse sans creer d'inscription d'application dediee. Si la politique
  d'acces conditionnel de l'organisation bloque ce client, il faudra a la
  place enregistrer une application dediee dans Azure AD.
- Les noms de champs "gs_*" ont ete deduits du nom des colonnes de l'export
  Excel existant (via la feuille cachee qui associe logical name -> libelle).
  Ce ne sont PAS des noms officiellement confirmes contre le schema reel :
  lance d'abord --probe et compare la sortie aux noms de colonnes attendus
  avant de lancer un export complet.
- Le champ "Statut Prise en Charge 1er Ligne" (indicateur SLA de 1re ligne)
  provient d'une instance de KPI SLA liee (entite slakpiinstance), pas d'un
  attribut simple de l'incident : il n'est pas inclus ici. Le champ
  "Statut Resolution 2e Ligne" (gs_sla_state) est inclus et suffit pour le
  tableau de bord existant.
"""

import argparse
import csv
import sys
import time
import webbrowser

import msal
import requests

DEVICE_CODE_CLIENT_ID = "51f81489-12ee-4a9e-aaae-a2591f45987d"
API_VERSION = "v9.2"

# logical name -> colonne de sortie (alignee sur l'export Excel existant)
FIELDS = {
    "ticketnumber": "Numero de la requete",
    "createdon": "Creee le",
    "modifiedon": "Modifie le",
    "statecode": "Statut systeme",
    "_gs_incidentstatusid_value": "Statut",
    "_gs_incidentsubstatusid_value": "Sous-statut",
    "_gs_qualificationlevel1id_value": "Theme",
    "_gs_qualificationlevel2id_value": "Sous-theme",
    "_gs_qualificationlevel13d_value": "Raison",
    "_gs_incidenttypeid_value": "Type de requete",
    "gs_owningteam": "Equipe proprietaire de la requete",
    "gs_sla_state": "Statut Resolution 2e Ligne",
    "gs_isimmediateattention": "Attention immediate",
    "gs_actionrequired": "Nouvelle info",
    "_parentcaseid_value": "Requete parent",
}

FORMATTED_SUFFIX = "@OData.Community.Display.V1.FormattedValue"


def get_token(org_url: str) -> str:
    authority = "https://login.microsoftonline.com/organizations"
    app = msal.PublicClientApplication(DEVICE_CODE_CLIENT_ID, authority=authority)
    scopes = [f"{org_url.rstrip('/')}/.default"]

    flow = app.initiate_device_flow(scopes=scopes)
    if "user_code" not in flow:
        raise RuntimeError(f"Echec de l'initiation du device code flow: {flow}")

    print(flow["message"])
    try:
        webbrowser.open(flow["verification_uri"])
    except Exception:
        pass

    result = app.acquire_token_by_device_flow(flow)
    if "access_token" not in result:
        raise RuntimeError(f"Echec d'authentification: {result.get('error_description', result)}")
    return result["access_token"]


def probe(org_url: str, token: str) -> None:
    url = f"{org_url.rstrip('/')}/api/data/{API_VERSION}/incidents?$top=1"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Prefer": 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
    }
    resp = requests.get(url, headers=headers, timeout=60)
    resp.raise_for_status()
    rows = resp.json().get("value", [])
    if not rows:
        print("Aucun enregistrement retourne (verifie les droits du compte).")
        return
    import json
    print(json.dumps(rows[0], indent=2, ensure_ascii=False))
    print()
    print("-> Compare ces cles avec le dictionnaire FIELDS dans ce script et ajuste-le si besoin.")


def fetch_all(org_url: str, token: str, since: str | None):
    # Les cles de FIELDS sont deja la syntaxe Web API attendue par $select :
    # nom simple pour un attribut plat (ex. createdon), "_nom_value" pour un
    # lookup (ex. _gs_qualificationlevel1id_value).
    select = ",".join(FIELDS.keys())
    query = f"$select={select}&$orderby=createdon asc"
    if since:
        query += f"&$filter=createdon ge {since}T00:00:00Z"
    url = f"{org_url.rstrip('/')}/api/data/{API_VERSION}/incidents?{query}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Prefer": (
            'odata.include-annotations="OData.Community.Display.V1.FormattedValue";'
            "odata.maxpagesize=5000"
        ),
    }

    total = 0
    while url:
        resp = requests.get(url, headers=headers, timeout=120)
        if resp.status_code == 401:
            raise RuntimeError("Jeton expire ou invalide - relance le script pour te reauthentifier.")
        resp.raise_for_status()
        payload = resp.json()
        rows = payload.get("value", [])
        for row in rows:
            total += 1
            yield row
        url = payload.get("@odata.nextLink")
        if url:
            print(f"  ... {total} requetes recuperees, page suivante", file=sys.stderr)


def row_to_record(row: dict) -> dict:
    record = {}
    for logical_name, out_col in FIELDS.items():
        formatted_key = logical_name + FORMATTED_SUFFIX
        if formatted_key in row:
            record[out_col] = row.get(formatted_key)
        else:
            record[out_col] = row.get(logical_name)
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--org", required=True, help="URL de l'organisation Dynamics, ex. https://terrebonne.crm3.dynamics.com")
    parser.add_argument("--out", help="Fichier CSV de sortie")
    parser.add_argument("--since", help="Ne recuperer que les requetes creees depuis cette date (YYYY-MM-DD)")
    parser.add_argument("--probe", action="store_true", help="Recupere 1 seul enregistrement brut pour verifier les noms de champs")
    args = parser.parse_args()

    token = get_token(args.org)

    if args.probe:
        probe(args.org, token)
        return

    if not args.out:
        parser.error("--out est requis sauf en mode --probe")

    start = time.time()
    count = 0
    with open(args.out, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=list(FIELDS.values()))
        writer.writeheader()
        for row in fetch_all(args.org, token, args.since):
            writer.writerow(row_to_record(row))
            count += 1

    elapsed = time.time() - start
    print(f"{count} requetes ecrites dans {args.out} en {elapsed:.1f}s")


if __name__ == "__main__":
    main()
