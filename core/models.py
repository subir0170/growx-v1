from django.contrib.auth.models import User
from django.db import models


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    full_name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.full_name


class XAccount(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    username = models.CharField(max_length=100)
    status = models.CharField(max_length=50, default="Disconnected")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"@{self.username} ({self.user.username})"


class TelegramSource(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    username = models.CharField(max_length=100)
    status = models.CharField(max_length=50, default="Disconnected")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"@{self.username} ({self.user.username})"


class PostQueue(models.Model):
    STATUS_CHOICES = [
        ("NEW", "New"),
        ("AI_GENERATED", "AI Generated"),
        ("COMPLETED", "Completed"),
        ("SKIPPED", "Skipped"),
        ("FAILED", "Failed"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    x_username = models.CharField(max_length=100)
    x_url = models.URLField(max_length=500)
    post_text = models.TextField()
    published_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="NEW")
    ai_response = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("user", "x_url")

    def __str__(self):
        return f"{self.x_username} - {self.status}"


class ResponseHistory(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    queue_item = models.ForeignKey(
        PostQueue, on_delete=models.SET_NULL, null=True, blank=True
    )
    x_url = models.URLField(max_length=500)
    x_username = models.CharField(max_length=100)
    ai_response = models.TextField()
    status = models.CharField(max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"History: {self.x_username} ({self.status})"


class AIProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    role = models.CharField(max_length=100, default="Professional")
    tone = models.CharField(max_length=100, default="Friendly")
    custom_prompt = models.TextField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"AI Profile for {self.user.username}"