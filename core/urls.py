from django.urls import path
from . import views

urlpatterns = [
    path("health/", views.health_check, name="health_check"),
    path("register/", views.api_register, name="api_register"),
    path("login/", views.api_login, name="api_login"),
    path("logout/", views.api_logout, name="api_logout"),
    path("me/", views.api_me, name="api_me"),
    path("dashboard/", views.api_dashboard, name="api_dashboard"),
    path("account/x/", views.api_account_x, name="api_account_x"),
    path(
        "account/telegram/",
        views.api_account_telegram,
        name="api_account_telegram",
    ),
    path("queue/", views.api_queue, name="api_queue"),
    path("queue/pending/", views.api_queue_pending, name="api_queue_pending"),
    path(
        "queue/<int:item_id>/<str:action>/",
        views.api_queue_action,
        name="api_queue_action",
    ),
    path("history/", views.api_history, name="api_history"),
    path("settings/", views.api_settings, name="api_settings"),
]