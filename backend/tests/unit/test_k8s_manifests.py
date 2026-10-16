"""Backend probe/drain contract: startup owns boot, LB drains before SIGKILL.

Guards the 1am BackendDown root cause (37s boot vs 30s/10s probe delays)
and the k6 p99 == grace-period kill (no preStop drain). CI kubeconform
validates schema; this validates the contract.
"""

from pathlib import Path

import yaml

DEPLOYMENT = Path(__file__).resolve().parents[3] / "k8s" / "base" / "backend-deployment.yaml"
CRONJOB = Path(__file__).resolve().parents[3] / "k8s" / "base" / "maintenance-cronjob.yaml"


def _backend_container():
    manifest = yaml.safe_load(DEPLOYMENT.read_text())
    containers = manifest["spec"]["template"]["spec"]["containers"]
    return next(c for c in containers if c["name"] == "backend")


def test_startup_probe_owns_boot_window():
    container = _backend_container()
    startup = container["startupProbe"]
    # Must clear the ~37s boot (pull + gunicorn/Flask import) with margin.
    assert startup["failureThreshold"] * startup["periodSeconds"] >= 60


def test_liveness_readiness_have_no_boot_delay():
    container = _backend_container()
    # initialDelay on liveness/readiness reboots healthy pods mid-boot;
    # the startupProbe gates them instead.
    assert "initialDelaySeconds" not in container["livenessProbe"]
    assert "initialDelaySeconds" not in container["readinessProbe"]


def test_prestop_drain_fits_inside_grace():
    manifest = yaml.safe_load(DEPLOYMENT.read_text())
    grace = manifest["spec"]["template"]["spec"]["terminationGracePeriodSeconds"]
    prestop = _backend_container()["lifecycle"]["preStop"]["exec"]["command"]
    assert prestop[0] == "sleep"
    assert int(prestop[1]) < grace


def test_maintenance_cronjob_is_locked_down():
    """Destructive cleanup runs off the request path as a locked-down CronJob."""
    manifest = yaml.safe_load(CRONJOB.read_text())
    assert manifest["kind"] == "CronJob"
    assert manifest["metadata"]["name"] == "devsync-maintenance"
    assert manifest["spec"]["concurrencyPolicy"] == "Forbid"

    pod = manifest["spec"]["jobTemplate"]["spec"]["template"]["spec"]
    assert pod["restartPolicy"] == "OnFailure"
    assert pod["securityContext"]["runAsNonRoot"] is True
    container = next(c for c in pod["containers"] if c["name"] == "maintenance")
    assert container["securityContext"]["capabilities"]["drop"] == ["ALL"]
    assert container["securityContext"]["readOnlyRootFilesystem"] is True
