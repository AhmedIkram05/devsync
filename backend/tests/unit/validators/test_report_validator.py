import pytest

from backend.src.api.validators.report_validator import validate_report_data


def _valid_payload():
    return {
        "report_type": "tasks",
        "date_range": "week",
        "summary": {},
        "details": [],
    }


def test_validate_report_data_success(app):
    with app.app_context():
        assert validate_report_data(_valid_payload()) is None


@pytest.mark.parametrize("missing_field", ["report_type", "date_range", "summary", "details"])
def test_validate_report_data_missing_required_fields(app, missing_field):
    payload = _valid_payload()
    payload.pop(missing_field)

    with app.app_context():
        response, status = validate_report_data(payload)

    assert status == 400
    assert missing_field in response.get_json()["message"]


def test_validate_report_data_invalid_report_type(app):
    payload = _valid_payload()
    payload["report_type"] = "invalid"

    with app.app_context():
        response, status = validate_report_data(payload)

    assert status == 400
    assert "Invalid report_type" in response.get_json()["message"]


def test_validate_report_data_invalid_date_range(app):
    payload = _valid_payload()
    payload["date_range"] = "all"

    with app.app_context():
        response, status = validate_report_data(payload)

    assert status == 400
    assert "Invalid date_range" in response.get_json()["message"]


def test_validate_report_data_summary_must_be_object(app):
    payload = _valid_payload()
    payload["summary"] = []

    with app.app_context():
        response, status = validate_report_data(payload)

    assert status == 400
    assert response.get_json()["message"] == "Summary must be a JSON object"


def test_validate_report_data_details_must_be_array(app):
    payload = _valid_payload()
    payload["details"] = {}

    with app.app_context():
        response, status = validate_report_data(payload)

    assert status == 400
    assert response.get_json()["message"] == "Details must be a JSON array"


@pytest.mark.parametrize("report_type", ["tasks", "developers", "github"])
def test_validate_report_data_accepts_all_report_types(app, report_type):
    payload = _valid_payload()
    payload["report_type"] = report_type

    with app.app_context():
        assert validate_report_data(payload) is None


@pytest.mark.parametrize("date_range", ["week", "month", "quarter", "year"])
def test_validate_report_data_accepts_all_date_ranges(app, date_range):
    payload = _valid_payload()
    payload["date_range"] = date_range

    with app.app_context():
        assert validate_report_data(payload) is None
