from django.contrib import admin
from .models import (
    AIProfile,
    PostQueue,
    ResponseHistory,
    TelegramSource,
    UserProfile,
    XAccount,
)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "full_name", "email", "created_at")
    search_fields = ("full_name", "email")


@admin.register(XAccount)
class XAccountAdmin(admin.ModelAdmin):
    list_display = ("user", "username", "status", "created_at")
    search_fields = ("username", "user__username")


@admin.register(TelegramSource)
class TelegramSourceAdmin(admin.ModelAdmin):
    list_display = ("user", "username", "status", "created_at")
    search_fields = ("username", "user__username")


@admin.register(PostQueue)
class PostQueueAdmin(admin.ModelAdmin):
    list_display = ("user", "x_username", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("x_username", "x_url")


@admin.register(ResponseHistory)
class ResponseHistoryAdmin(admin.ModelAdmin):
    list_display = ("user", "x_username", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("x_username", "x_url")


@admin.register(AIProfile)
class AIProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "tone", "updated_at")
    search_fields = ("user__username", "role")