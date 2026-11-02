import argparse

from sqlalchemy import select

from app.database import SessionLocal
from app.models import AuditLog, User


def main():
    parser = argparse.ArgumentParser(description="Operator-only VARSHIQ role management")
    parser.add_argument("command", choices=["set-role"])
    parser.add_argument("email")
    parser.add_argument("role", choices=["owner", "municipal", "admin"])
    args = parser.parse_args()
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == args.email.lower()))
        if user is None:
            parser.error("Register the account first")
        before = user.role
        user.role = args.role
        db.add(
            AuditLog(
                user_id=user.id,
                action="operator.role",
                resource_id=user.id,
                details={"before": before, "after": args.role},
            )
        )
        db.commit()
        print("Role updated and audited")


if __name__ == "__main__":
    main()
