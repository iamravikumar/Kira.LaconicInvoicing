import { Injectable, Injector } from '@angular/core';
import { Router } from '@angular/router';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpErrorResponse,
  HttpSentEvent,
  HttpHeaderResponse,
  HttpProgressEvent,
  HttpResponse,
  HttpUserEvent,
} from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { mergeMap, catchError, timeout } from 'rxjs/operators';
import { NzMessageService } from 'ng-zorro-antd';
import { _HttpClient } from '@delon/theme';
import { environment } from '@env/environment';
import { AjaxResult, AjaxResultType } from '@shared/osharp/osharp.model';
import { DA_SERVICE_TOKEN, JWTTokenModel } from '@delon/auth';

/**
 * 默认HTTP拦截器，其注册细节见 `app.module.ts`
 */
@Injectable()
export class DefaultInterceptor implements HttpInterceptor {
  constructor(private injector: Injector) { }

  get msg(): NzMessageService {
    return this.injector.get(NzMessageService);
  }

  private goTo(url: string) {
    setTimeout(() => this.injector.get(Router).navigateByUrl(url));
  }

  private handleData(
    event: HttpResponse<any> | HttpErrorResponse,
  ): Observable<any> {
    // 可能会因为 `throw` 导出无法执行 `_HttpClient` 的 `end()` 操作
    this.injector.get(_HttpClient).end();
    // 业务处理：一些通用操作
    switch (event.status) {
      case 200:
        // 业务层级错误处理，以下是假定restful有一套统一输出格式（指不管成功与否都有相应的数据格式）情况下进行处理
        // 例如响应内容：
        //  错误内容：{ status: 1, msg: '非法参数' }
        //  正确内容：{ status: 0, response: {  } }
        // 则以下代码片断可直接适用
        if (event instanceof HttpResponse) {
          const result = event.body as AjaxResult;
          if (result && result.type) {
            switch (result.type) {
              case AjaxResultType.success:
              case AjaxResultType.info:
              case AjaxResultType.error:
              case AjaxResultType.locked:
                return of(event);
              case AjaxResultType.unAuth:
                this.msg.warning('用户未登录或者登录已过期');
                this.goTo('/identity/login');
                break;
              default:
                let type = <number>result.type;
                this.goTo(`/${type}`);
                break;
            }
          }

          if (result && result.type && result.type !== AjaxResultType.success) {
            this.msg.error(result.content);
            // 继续抛出错误中断后续所有 Pipe、subscribe 操作，因此：
            // this.http.get('/').subscribe() 并不会触发
            return throwError({});
          } else {
            // 重新修改 `body` 内容为 `response` 内容，对于绝大多数场景已经无须再关心业务状态码
            // return of(new HttpResponse(Object.assign(event, { body: body.response })));
            // 或者依然保持完整的格式
            return of(event);
          }
        }
        break;
      case 401: // 未登录状态码
        this.msg.warning('用户未登录或者登录已过期');
        this.goTo('/identity/login');
        break;
      case 403:
      case 404:
      case 500:
        this.goTo(`/${event.status}`);
        break;
      default:
        if (event instanceof HttpErrorResponse) {
          console.warn(
            '未可知错误，大部分是由于后端不支持CORS或无效配置引起',
            event,
          );
          this.msg.error(event.message);
        }
        break;
    }
    return of(event);
  }

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler,
  ): Observable<
    | HttpSentEvent
    | HttpHeaderResponse
    | HttpProgressEvent
    | HttpResponse<any>
    | HttpUserEvent<any>
  > {
    // 统一加上服务端前缀
    let url = req.url;
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      url = environment.SERVER_URL + url;
    }
    let newReq = req.clone({
      url: url,
    });
    // 设置JWT-Token
    const model = this.injector
      .get(DA_SERVICE_TOKEN)
      .get<JWTTokenModel>(JWTTokenModel);

    if (model && model.token && !model.isExpired()) {
      newReq = newReq.clone({
        setHeaders: {
          Authorization: `Bearer ${model.token}`,
        },
      });
    }

    return next.handle(newReq).pipe(
      timeout(60 * 1000 * 10),
      mergeMap((event: any) => {
        // 允许统一对请求错误处理，这是因为一个请求若是业务上错误的情况下其HTTP请求的状态是200的情况下需要
        if (event instanceof HttpResponse && event.status === 200)
          return this.handleData(event);
        // 若一切都正常，则后续操作
        return of(event);
      }),
      catchError((err: HttpErrorResponse) => {
        return this.handleData(err);
      }),
    );
  }
}
