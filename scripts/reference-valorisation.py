# Reference calculation (independent of the JavaScript code) of the "Atelier Exemple" test case.
# Formulas: PLAN.md § 5.2. Assumptions: src/data/hypotheses.json (values copied here by hand).
ans = [2023, 2024, 2025]
CA   = {2023: 2_000_000, 2024: 2_200_000, 2025: 2_400_000}
ACH  = {2023: 800_000, 2024: 880_000, 2025: 960_000}
EXT  = {2023: 300_000, 2024: 320_000, 2025: 340_000}
IMP  = {a: 40_000 for a in ans}
PERS = {2023: 600_000, 2024: 640_000, 2025: 680_000}
ebe = {a: CA[a] - ACH[a] - EXT[a] - IMP[a] - PERS[a] for a in ans}
print("EBE comptable", ebe)
# Adjustments: owner 150,000 actual vs 100,000 normalized (+50,000); rent 60,000 paid vs 48,000 market (+12,000)
# non-recurring 2024: +20,000 (one-off expense)
ret = {a: ebe[a] + 50_000 + 12_000 + (20_000 if a == 2024 else 0) for a in ans}
print("EBE retraité", ret)
ebeN = sum(ret.values()) / 3
print("EBE normatif (moyenne 3 ans)", ebeN)
m = (4, 5.6, 7)
ve_m = [ebeN * x for x in m]
print("VE multiples", ve_m)
# Working capital
ST = {2023: 160_000, 2024: 180_000, 2025: 200_000}; CL = {2023: 340_000, 2024: 370_000, 2025: 400_000}
FO = {2023: 210_000, 2024: 230_000, 2025: 250_000}; FS = {2023: 130_000, 2024: 140_000, 2025: 150_000}
bfr = {a: ST[a] + CL[a] - FO[a] - FS[a] for a in ans}
jours = {a: bfr[a] / CA[a] * 365 for a in ans}
jN = sum(jours.values()) / 3
bfrN = jN / 365 * CA[2025]
ecart = bfr[2025] - bfrN
print("BFR", bfr, "jours", jours, "jours normatifs", jN, "BFR normatif", bfrN, "écart", ecart)
# Net debt 2025
dn = 300_000 + 0 + 50_000 + 20_000 + 0 - 250_000 - 50_000
print("Dette nette", dn)
# Discounts: -10% owner dependence, +5% recurrence → factor 0.95
f = 1 - 0.10 + 0.05
titres_m = [v * f - dn + ecart for v in ve_m]
print("Titres multiples (décotes, pont)", titres_m)
# WACC
rf, erp, kd0, t = 0.0327, 0.0501, 0.0371, 0.25
bu, de = 1.0844, 0.1136
bl = bu * (1 + (1 - t) * de)
ke = rf + bl * erp + 0.03
wd = de / (1 + de); we = 1 / (1 + de)
k = we * ke + wd * kd0 * (1 - t)
print("bêta endetté", bl, "ke", ke, "poids dette", wd, "CMPC", k)
# 5-year DCF, end-of-year convention, corporate tax at the standard rate (reduced rate not applicable here)
def dcf(k, g=0.02, croissance=0.05, marge=0.16, da=0.03, capex=0.03, j=30, reduit=False):
    ca_prec = 2_400_000; bfr_prec = j / 365 * ca_prec; flux = []
    for n in range(1, 6):
        ca = ca_prec * (1 + croissance)
        e = ca * marge; d = ca * da; ebit = e - d
        if reduit:
            imp = max(0, min(ebit, 42_500)) * 0.15 + max(0, ebit - 42_500) * 0.25
        else:
            imp = max(0, ebit) * 0.25
        b = j / 365 * ca
        fl = ebit - imp + d - ca * capex - (b - bfr_prec)
        flux.append(fl); ca_prec, bfr_prec = ca, b
    vt = flux[-1] * (1 + g) / (k - g)
    va = sum(fl / (1 + k) ** (i + 1) for i, fl in enumerate(flux))
    vt_act = vt / (1 + k) ** 5
    return flux, vt, va, vt_act, va + vt_act
fl, vt, va, vta, ve_d = dcf(k)
print("Flux", fl); print("VT", vt, "VA flux", va, "VA VT", vta, "VE DCF", ve_d)
titres_d = ve_d * f - dn + ecart
_, _, _, _, ve_d_haut = dcf(k - 0.01); _, _, _, _, ve_d_bas = dcf(k + 0.01)
print("Titres DCF central", titres_d, "bas (CMPC+1)", ve_d_bas * f - dn + ecart, "haut (CMPC-1)", ve_d_haut * f - dn + ecart)
# ANCC (adjusted net assets)
ancc = 900_000 + 0 - 0 - 10_000
print("ANCC", ancc)
central = 0.6 * titres_m[1] + 0.4 * titres_d
print("Synthèse centrale 60/40", central)
print("IS taux réduit sur 100 000 :", 42_500 * 0.15 + 57_500 * 0.25)
print("Sensibilité multiple +1x (titres)", (ebeN * 6.6) * f - dn + ecart, " -1x", (ebeN * 4.6) * f - dn + ecart)
