"""Loaded automatically when start.sh puts this directory on PYTHONPATH.

OpenBB's Finviz screener model treats Finviz's "-" blanks as invalid floats
(valuation views 500). Coerce those sentinels to None before Pydantic runs.

filters_dict is a dict + kw_only field, so OpenBB injects it as FastAPI Body.
GET cannot carry a body; expose it as a query string and parse it in transform_query.
"""

from __future__ import annotations

import json

_MISSING = {"-", "—", "", "N/A", "n/a", "NA", ".", "None"}


def _coerce(row: object) -> object:
    if not isinstance(row, dict):
        return row
    out = dict(row)
    for key, val in list(out.items()):
        if isinstance(val, str):
            stripped = val.strip()
            if stripped in _MISSING:
                out[key] = None
            elif stripped.endswith("%"):
                try:
                    out[key] = float(stripped.rstrip("%")) / 100.0
                except ValueError:
                    out[key] = None
    return out


def _parse_filters_dict(value: object) -> dict:
    if value is None or value == "":
        return {}
    if isinstance(value, dict):
        return value
    if not isinstance(value, str):
        return {}
    raw = value[2:] if value.startswith("j:") else value
    parsed: object = json.loads(raw)
    if isinstance(parsed, str):
        parsed = json.loads(parsed)
    return parsed if isinstance(parsed, dict) else {}


try:
    from openbb_finviz.models.equity_screener import (
        FinvizEquityScreenerFetcher,
        FinvizEquityScreenerQueryParams,
    )

    field = FinvizEquityScreenerQueryParams.model_fields.get("filters_dict")
    if field is not None:
        field.kw_only = False
        field.annotation = str | None
        FinvizEquityScreenerQueryParams.model_rebuild(force=True)

    @staticmethod  # type: ignore[misc]
    def _transform_query(params):  # noqa: ANN001
        p = dict(params)
        parsed = _parse_filters_dict(p.pop("filters_dict", None))
        query = FinvizEquityScreenerQueryParams(**p)
        object.__setattr__(query, "filters_dict", parsed)
        return query

    FinvizEquityScreenerFetcher.transform_query = _transform_query  # type: ignore[method-assign]

    _orig = FinvizEquityScreenerFetcher.transform_data

    @staticmethod  # type: ignore[misc]
    def _transform(query, data, **kwargs):  # noqa: ANN001
        cleaned = [_coerce(row) for row in (data or [])]
        return _orig(query, cleaned, **kwargs)

    FinvizEquityScreenerFetcher.transform_data = _transform  # type: ignore[method-assign]
except Exception:
    pass
