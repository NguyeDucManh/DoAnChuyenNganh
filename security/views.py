from django.contrib.auth.decorators import login_required
from django.shortcuts import render

@login_required
def overview(request):
    user = request.user
    roles = [g.name for g in user.groups.all()]

    return render(request, 'security/security.html', {
        'username': user.username,
        'roles': roles,
        'is_admin': user.is_staff,
    })
